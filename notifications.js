async function sendOtp(phone, code) {
  if (process.env.SMS_PROVIDER !== 'zenvia') throw new Error('SMS_PROVIDER deve ser zenvia');
  if (!process.env.ZENVIA_API_TOKEN || !process.env.ZENVIA_FROM) throw new Error('ZENVIA_API_TOKEN e ZENVIA_FROM são obrigatórias');
  const response = await fetch('https://api.zenvia.com/v2/channels/sms/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-TOKEN': process.env.ZENVIA_API_TOKEN },
    body: JSON.stringify({ from: process.env.ZENVIA_FROM, to: phone, contents: [{ type: 'text', text: `Seu código 016 Ubercar é ${code}.` }] }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Zenvia respondeu ${response.status}`);
  return true;
}

module.exports = { sendOtp };