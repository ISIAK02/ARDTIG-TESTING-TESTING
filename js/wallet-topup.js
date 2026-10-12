import { currentUser, getFirebase } from './firebase.js';
import { createFlutterwaveCheckout, formatNaira } from './flutterwave-checkout.js';

const form = document.querySelector('#wallet-topup-form');
const input = document.querySelector('#topup-amount-input');
const methods = document.querySelector('#topup-methods');
const message = document.querySelector('#topup-message');
let user;

try {
  user = await currentUser();
  if (!user) location.replace(`/pages/auth.html?return=${encodeURIComponent(location.pathname + location.search)}`);
  else {
    const { db, doc, getDoc, onSnapshot } = await getFirebase();
    const profileRef = doc(db, 'users', user.uid);
    const profile = await getDoc(profileRef);
    renderBalance(profile);
    onSnapshot(profileRef, renderBalance);
  }
} catch (error) {
  showMessage(error.message || 'Wallet details could not load.');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number(input.value);
  if (!Number.isSafeInteger(amount) || amount < 1500 || amount > 100000 || (amount - 1500) % 500 !== 0) {
    showMessage('Choose an amount from ₦1,500 to ₦100,000 in ₦500 steps.');
    return;
  }
  form.dataset.amount = String(amount);
  document.querySelectorAll('[data-method]').forEach((button) => { button.disabled = !user; });
  methods.hidden = false;
  showMessage(`You will pay ${formatNaira(amount)} and receive ${amount.toLocaleString('en-NG')} ARDTIG balance after confirmation.`);
});

document.querySelectorAll('[data-method]').forEach((button) => button.addEventListener('click', async () => {
  const amount = Number(form.dataset.amount);
  if (!user || !amount || button.disabled) return;
  document.querySelectorAll('[data-method]').forEach((item) => { item.disabled = true; });
  showMessage('Connecting to Flutterwave…');
  try {
    const result = await createFlutterwaveCheckout(user, {
      flow: 'wallet_topup',
      amount,
      method: button.dataset.method,
    });
    if (result.redirectUrl) {
      location.assign(result.redirectUrl);
      return;
    }
    location.assign(`/pages/checkout.html?reference=${encodeURIComponent(result.reference)}`);
  } catch (error) {
    showMessage(error.message || 'Checkout could not be started.');
    document.querySelectorAll('[data-method]').forEach((item) => { item.disabled = false; });
  }
}));

function renderBalance(snapshot) {
  const balance = Number(snapshot.exists() ? snapshot.data().walletBalance || 0 : 0);
  document.querySelector('#topup-balance').textContent = formatNaira(balance);
}

function showMessage(text) {
  message.hidden = false;
  message.textContent = text;
}
