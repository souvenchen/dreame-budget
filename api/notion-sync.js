const NOTION_TOKEN = process.env.NOTION_TOKEN;
const REGION_DB    = process.env.REGION_DB_ID;
const PRODUCT_DB   = process.env.PRODUCT_DB_ID;

async function queryDB(dbId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  return res.json();
}

function getProp(props, key, type) {
  const p = props[key];
  if (!p) return null;
  if (type === 'title')   return p.title?.[0]?.plain_text || '';
  if (type === 'number')  return p.number ?? null;
  if (type === 'text')    return p.rich_text?.[0]?.plain_text || '';
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // ── 区域数据 ──
    const regionData = await queryDB(REGION_DB);
    const regions = regionData.results.map(p => ({
      name:  getProp(p.properties, '区域名称', 'title'),
      ratio: getProp(p.properties, '分摊比例(%)', 'number') ?? 0,
      month: getProp(p.properties, '截止月份', 'text') || '',
      note:  getProp(p.properties, '备注', 'text') || '',
    })).filter(r => r.name);

    // ── 产品颜色数据 ──
    const productData = await queryDB(PRODUCT_DB);
    const products = productData.results.map(p => {
      const name       = getProp(p.properties, '产品名称', 'title');
      const colorStr   = getProp(p.properties, '颜色列表', 'text') || '';
      const noteStr    = getProp(p.properties, '备注', 'text') || '';

      // 颜色列表用逗号分隔；备注里的限制格式：颜色名=区域1/区域2
      // 兼容旧格式：「细闪玻璃仅台湾，Master仅韩国」
      const restrictMap = {};
      const restrictMatches = noteStr.matchAll(/([^,，]+?)仅([^,，]+)/g);
      for (const m of restrictMatches) {
        restrictMap[m[1].trim()] = m[2].trim().split(/[\/、]/);
      }

      const colors = colorStr.split(',').map(s => s.trim()).filter(Boolean).map(colorName => ({
        name: colorName,
        restrictedTo: restrictMap[colorName] || null,
      }));

      return { name, colors };
    }).filter(p => p.name && p.colors.length);

    res.status(200).json({ ok: true, regions, products });

  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
