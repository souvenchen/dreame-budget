const NOTION_TOKEN = process.env.NOTION_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!NOTION_TOKEN) return res.status(500).json({ ok: false, error: '缺少环境变量 NOTION_TOKEN' });

  const { pageId, name, colorList, note } = req.body || {};
  if (!pageId || !name || !colorList) {
    res.status(400).json({ ok: false, error: '缺少必要字段' });
    return;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          '产品名称': { title: [{ text: { content: name } }] },
          '颜色列表': { rich_text: [{ text: { content: colorList } }] },
          '备注':     { rich_text: [{ text: { content: note || '' } }] },
        }
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Notion API ${response.status}`);
    }
    const page = await response.json();
    res.status(200).json({ ok: true, pageId: page.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
