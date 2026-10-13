import crypto from 'node:crypto';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const ts = req.headers['x-workpix-timestamp'] || '';
  const signature = req.headers['x-workpix-signature'] || '';

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WORKPIX_SECRET || '')
    .update(ts + '.' + rawBody)
    .digest('hex');

  const isValid = signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!isValid) return res.status(401).send('Unauthorized');
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return res.status(401).send('Expired');

  try {
    const { event, data } = JSON.parse(rawBody);

    if (event === 'charge.paid') {
      const extRef = data.external_id || '';
      const parts = extRef.split('-');
      const installmentNumber = parseInt(parts[1]);
      const chargeId = data.id;

      const sUrl = process.env.SUPABASE_URL;
      const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      await fetch(`${sUrl}/rest/v1/payments?mp_payment_id=eq.${chargeId}`, {
        method: 'PATCH',
        headers: {
          'apikey': sKey,
          'Authorization': `Bearer ${sKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'paid',
          paid_at: data.paid_at || new Date().toISOString()
        })
      });

      const payResp = await fetch(
        `${sUrl}/rest/v1/payments?mp_payment_id=eq.${chargeId}&select=client_id`,
        { headers: { 'apikey': sKey, 'Authorization': `Bearer ${sKey}` } }
      );
      const pays = await payResp.json();

      if (pays && pays[0]) {
        const clientId = pays[0].client_id;
        const cliResp = await fetch(
          `${sUrl}/rest/v1/clients?id=eq.${clientId}&select=installments,paid_installments`,
          { headers: { 'apikey': sKey, 'Authorization': `Bearer ${sKey}` } }
        );
        const clis = await cliResp.json();

        if (clis && clis[0]) {
          const installments = (clis[0].installments || []).map(inst => {
            if (inst.number === installmentNumber) {
              return { ...inst, status: 'Pago', paidDate: new Date().toISOString().split('T')[0] };
            }
            return inst;
          });
          const newPaidCount = installments.filter(i => i.status === 'Pago').length;

          await fetch(`${sUrl}/rest/v1/clients?id=eq.${clientId}`, {
            method: 'PATCH',
            headers: {
              'apikey': sKey,
              'Authorization': `Bearer ${sKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              installments: installments,
              paid_installments: newPaidCount,
              updated_at: new Date().toISOString()
            })
          });
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Erro webhook:', err);
    return res.status(500).send('Erro');
  }
}
