export async function createFlutterwaveCheckout(user, payload) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Checkout could not be started.');
  return result;
}

export async function getFlutterwaveCheckoutStatus(user, reference) {
  const url = new URL('/api/checkout-status', location.origin);
  url.searchParams.set('reference', reference);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Payment status could not be loaded.');
  return result;
}

export function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}
