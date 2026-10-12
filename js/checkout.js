import { currentUser, getFirebase } from './firebase.js';
import { createFlutterwaveCheckout, formatNaira, getFlutterwaveCheckoutStatus } from './flutterwave-checkout.js';

const params = new URLSearchParams(location.search);
const accountId = params.get('id');
const accountType = params.get('type');
const reference = params.get('reference');
const collectionByType = {
  freefire: 'freefire_accounts',
  cod: 'cod_accounts',
  efootball: 'efootball_accounts',
  diamonds: 'diamonds',
};
const layout = document.querySelector('#checkout-layout');
const message = document.querySelector('#checkout-message');
const statusMessage = document.querySelector('#checkout-status');
const methods = document.querySelector('#checkout-methods');
const transferPanel = document.querySelector('#transfer-instructions');
const checkButton = document.querySelector('#check-payment');
const ordersLink = document.querySelector('#my-orders');
let user;
let listing;
let pollTimer;
let expiryTimer;
let currentReference = reference;
let paymentFinished = false;

try {
  user = await currentUser();
  if (!user) {
    location.replace(`/pages/auth.html?return=${encodeURIComponent(location.pathname + location.search)}`);
  } else if (reference) {
    layout.hidden = false;
    methods.hidden = true;
    await refreshStatus();
    if (!paymentFinished) pollTimer = window.setInterval(refreshStatus, 5000);
  } else {
    await loadListing();
  }
} catch (error) {
  message.hidden = false;
  message.textContent = error.message || 'Checkout could not load.';
}

document.querySelectorAll('[data-method]').forEach((button) => button.addEventListener('click', () => startPayment(button.dataset.method, button)));
checkButton.addEventListener('click', refreshStatus);
document.querySelector('#copy-account').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#transfer-account').textContent);
    document.querySelector('#copy-account').textContent = 'COPIED';
  } catch {
    document.querySelector('#copy-account').textContent = 'COPY FAILED';
  }
});

async function loadListing() {
  if (!accountId || !collectionByType[accountType]) throw new Error('The listing link is incomplete.');
  const { db, doc, getDoc } = await getFirebase();
  const snapshot = await getDoc(doc(db, collectionByType[accountType], accountId));
  if (!snapshot.exists() || snapshot.data().status !== 'available') throw new Error('This listing is no longer available.');
  listing = snapshot.data();
  document.querySelector('#checkout-description').textContent = listing.prime || listing.packageName || `${accountType.toUpperCase()} listing`;
  document.querySelector('#checkout-price').textContent = formatNaira(listing.price);
  if (accountType === 'diamonds') document.querySelector('#diamond-fields').hidden = false;
  layout.hidden = false;
}

async function startPayment(method, button) {
  if (!user || !listing || button.disabled) return;
  if (accountType === 'diamonds') {
    const uid = document.querySelector('#player-uid').value.trim();
    const gameName = document.querySelector('#game-name').value.trim();
    if (!/^\d{5,40}$/.test(uid) || !gameName) {
      statusMessage.textContent = 'Enter a valid Free Fire UID and in-game name.';
      return;
    }
  }
  methods.querySelectorAll('button').forEach((item) => { item.disabled = true; });
  statusMessage.textContent = 'Connecting to Flutterwave…';
  try {
    const result = await createFlutterwaveCheckout(user, {
      flow: 'listing',
      method,
      accountId,
      accountType,
      uid: accountType === 'diamonds' ? document.querySelector('#player-uid').value.trim() : undefined,
      gameName: accountType === 'diamonds' ? document.querySelector('#game-name').value.trim() : undefined,
    });
    currentReference = result.reference;
    if (result.redirectUrl) {
      location.assign(result.redirectUrl);
      return;
    }
    document.querySelector('#checkout-description').textContent = listing.prime || listing.packageName || `${accountType.toUpperCase()} listing`;
    renderTransfer(result.transfer, result.amount);
    methods.hidden = true;
    checkButton.hidden = false;
    statusMessage.textContent = 'Waiting for Flutterwave to confirm your transfer.';
    pollTimer = window.setInterval(refreshStatus, 5000);
  } catch (error) {
    statusMessage.textContent = error.message || 'Payment could not be started.';
    methods.querySelectorAll('button').forEach((item) => { item.disabled = false; });
  }
}

function renderTransfer(transfer, amount) {
  if (!transfer) return;
  transferPanel.hidden = false;
  document.querySelector('#transfer-bank').textContent = transfer.bankName || 'Flutterwave transfer account';
  document.querySelector('#transfer-account').textContent = transfer.accountNumber || '—';
  document.querySelector('#transfer-amount').textContent = formatNaira(amount || transfer.amount || listing?.price);
  const expiry = transfer.expiresAt ? new Date(transfer.expiresAt) : null;
  const expiryLabel = document.querySelector('#transfer-expiry');
  if (expiry && !Number.isNaN(expiry.getTime())) {
    const updateExpiry = () => {
      const seconds = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
      expiryLabel.textContent = seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining` : 'Expired';
    };
    updateExpiry();
    window.clearInterval(expiryTimer);
    expiryTimer = window.setInterval(updateExpiry, 1000);
  } else expiryLabel.textContent = 'See Flutterwave instructions';
}

async function refreshStatus() {
  if (!user || !currentReference) return;
  try {
    const result = await getFlutterwaveCheckoutStatus(user, currentReference);
    document.querySelector('#checkout-description').textContent = result.description || (result.flow === 'wallet_topup' ? 'ARDTIG wallet top-up' : document.querySelector('#checkout-description').textContent);
    if (result.amount) document.querySelector('#checkout-price').textContent = formatNaira(result.amount);
    if (result.method === 'bank_transfer') renderTransfer(result.transfer, result.amount);
    if (result.status === 'paid') {
      paymentFinished = true;
      window.clearInterval(pollTimer);
      window.clearInterval(expiryTimer);
      methods.hidden = true;
      checkButton.hidden = true;
      ordersLink.href = result.flow === 'wallet_topup' ? '/topup.html' : '/pages/myaccounts.html';
      ordersLink.textContent = result.flow === 'wallet_topup' ? 'RETURN TO WALLET' : 'VIEW MY ORDERS';
      ordersLink.hidden = false;
      statusMessage.textContent = result.flow === 'wallet_topup'
        ? 'Payment confirmed. Your ARDTIG balance has been credited.'
        : result.accountType === 'diamonds'
          ? 'Payment confirmed. Your diamond order is waiting for admin review.'
          : 'Payment confirmed. Your account details are ready in My Accounts.';
      return;
    }
    if (result.status === 'paid_needs_review') {
      paymentFinished = true;
      window.clearInterval(pollTimer);
      ordersLink.hidden = false;
      statusMessage.textContent = 'Payment received. Contact the store so we can resolve this order.';
      return;
    }
    if (result.status === 'failed') {
      paymentFinished = true;
      window.clearInterval(pollTimer);
      methods.hidden = false;
      methods.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      statusMessage.textContent = 'This payment could not be completed. You can try again.';
      return;
    }
    if (result.status === 'pending') {
      checkButton.hidden = false;
      if (result.method === 'bank_transfer') {
        transferPanel.hidden = false;
        statusMessage.textContent = 'Waiting for Flutterwave to confirm your transfer.';
      } else statusMessage.textContent = 'Checking your bank authorization…';
    }
  } catch (error) {
    statusMessage.textContent = error.message || 'Payment status could not be loaded.';
  }
}
