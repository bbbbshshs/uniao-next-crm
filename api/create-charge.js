export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Metodo nao permitido' } });

  try {
    const { amount, external_id, client_id, installment_number } = req.body;
    if (!amount || amount < 100) {
      return res.status(422).json({ error: { message: 'Valor invalido (minimo R$ 1,00)' } });
    }

    const response = await fetch('https://openfinancesbot.com/v1/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WORKPIX_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount,
        external_id: external_id,
        callback_url: `${process.env.PUBLIC_URL}/api/webhook`
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    if (client_id && installment_number) {
      const sUrl = process.env.SUPABASE_URL;
      const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      await fetch(`${sUrl}/rest/v1/payments`, {
        method: 'POST',
        headers: {
          'apikey': sKey,
          'Authorization': `Bearer ${sKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          client_id: client_id,
          installment_number: installment_number,
          amount: amount / 100,
          status: 'pending',
          mp_payment_id: data.id,
          pix_qr_code: data.qr_code,
          pix_copy_paste: data.qr_code
        })
      }).catch(e => console.error('Erro ao salvar payment:', e));
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
}
