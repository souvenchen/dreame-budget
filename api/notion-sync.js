const NOTION_TOKEN = process.env.NOTION_TOKEN;
const REGION_DB    = process.env.REGION_DB_ID  || '6b7b434c-8690-4e61-9456-0bef867b003c';
const PRODUCT_DB   = process.env.PRODUCT_DB_ID || '98f2e4e0-9df1-4c14-b913-884515d37122';

async function queryDB(dbId, label) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${label}] Notion API ${res.status}: ${body.message || body.code || '未知错误'}`);
  }
  return res.json();
}

function getProp(props, key, type) {
  const p = props[key];
  if (!p) return null;
  if (type === 'title')  return p.title?.[0]?.plain_text || '';
  if (type === 'number') return p.number ?? null;
  if (type === 'text')   return p.rich_text?.[0]?.plain_text || '';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!NOTION_TOKEN) return res.status(500).json({ ok: false, error: '缺少环境变量 NOTION_TOKEN，请在 Vercel 项目设置中添加' });

  try {
    const regionData  = await queryDB(REGION_DB, '区域比例库');
    const productData = await queryDB(PRODUCT_DB, '产品颜色库');

    const regions = regionData.results.map(p => ({
      name:  getProp(p.properties, '区域名称', 'title'),
      ratio: getProp(p.properties, '分摊比例(%)', 'number') ?? 0,
      month: getProp(p.properties, '截止月份', 'text') || '',
      note:  getProp(p.properties, '备注', 'text') || '',
    })).filter(r => r.name);

    const products = productData.results.map(p => {
      const name     = getProp(p.properties, '产品名称', 'title');
      const colorStr = getProp(p.properties, '颜色列表', 'text') || '';
      const noteStr  = getProp(p.properties, '备注', 'text') || '';
      const restrictMap = {};
      for (const m of noteStr.matchAll(/([^,，]+?)仅([^,，]+)/g)) {
        restrictMap[m[1].trim()] = m[2].trim().split(/[\/、]/);
      }
      const colors = colorStr.split(',').map(s => s.trim()).filter(Boolean).map(name => ({
        name, restrictedTo: restrictMap[name] || null,
      }));
      return { id: p.id, name, colors };
    }).filter(p => p.name && p.colors.length);

    res.status(200).json({ ok: true, regions, products });
  } catch (e) {
    console.error('[notion-sync]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
}
