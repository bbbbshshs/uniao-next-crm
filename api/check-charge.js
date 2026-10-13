export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) {
    return res.status(422).json({ error: { message: 'ID obrigatorio' } });
  }

  try {
    const response = await fetch(`https://openfinancesbot.com/v1/charges/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.WORKPIX_TOKEN}`
      }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
}
