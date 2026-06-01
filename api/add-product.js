const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PRODUCT_DB   = process.env.PRODUCT_DB_ID;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const { name, colorList, note } = req.body;
  if (!name || !colorList) {
    res.status(400).json({ ok: false, error: '缺少必要字段' }); return;
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: PRODUCT_DB },
        properties: {
          '产品名称': {
            title: [{ text: { content: name } }]
          },
          '颜色列表': {
            rich_text: [{ text: { content: colorList } }]
          },
          '备注': {
            rich_text: [{ text: { content: note || '' } }]
          },
        }
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `Notion API ${response.status}`);
    }

    const page = await response.json();
    res.status(200).json({ ok: true, pageId: page.id });

  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
