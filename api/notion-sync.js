const NOTION_TOKEN = process.env.NOTION_TOKEN;
const REGION_DB    = process.env.REGION_DB_ID  || '6b7b434c-8690-4e61-9456-0bef867b003c';
const PRODUCT_DB   = process.env.PRODUCT_DB_ID || '98f2e4e0-9df1-4c14-b913-884515d37122';
const REGION_NAMES = ['新兴','亚欧区','日本','澳洲','东北欧','土耳其','韩国','北美','台湾','西南欧','东南亚（不含台湾）'];

async function queryDB(dbId, label) {
  const results = [];
  let startCursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(startCursor ? { start_cursor: startCursor } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`[${label}] Notion API ${res.status}: ${body.message || body.code || '未知错误'}`);
    }
    const data = await res.json();
    results.push(...data.results);
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor);
  return { results };
}

function getProp(props, key, type) {
  const p = props[key];
  if (!p) return null;
  if (type === 'title')  return p.title?.[0]?.plain_text || '';
  if (type === 'number') return p.number ?? null;
  if (type === 'text')   return p.rich_text?.[0]?.plain_text || p.select?.name || p.date?.start || '';
  return null;
}

function normalizeMonthValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})[-/.年](\d{1,2})/);
  if (!match) return raw;
  return `${match[1]}-${String(Number(match[2])).padStart(2,'0')}`;
}

function parseRegionRows(pages) {
  const rows = [];
  pages.forEach(page => {
    const props = page.properties;
    const title = getProp(props, '区域名称', 'title');
    const month = normalizeMonthValue(getProp(props, '截止月份', 'text') || title);
    const note = getProp(props, '备注', 'text') || '';

    // New format: one Notion row per month, with each region as a number column.
    const wideValues = REGION_NAMES
      .map(name => ({ name, ratio: getProp(props, name, 'number') }))
      .filter(item => item.ratio !== null);
    if (month && wideValues.length) {
      wideValues.forEach(item => rows.push({ name: item.name, ratio: item.ratio, month, note }));
      return;
    }

    // Legacy format: one Notion row per region per month.
    const legacyRatio = getProp(props, '分摊比例(%)', 'number');
    if (title && legacyRatio !== null) {
      rows.push({ name: title, ratio: legacyRatio, month, note });
    }
  });
  return rows.filter(r => r.name && r.month);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!NOTION_TOKEN) return res.status(500).json({ ok: false, error: '缺少环境变量 NOTION_TOKEN，请在 Vercel 项目设置中添加' });

  try {
    const regionData  = await queryDB(REGION_DB, '区域比例库');
    const productData = await queryDB(PRODUCT_DB, '产品颜色库');

    const regions = parseRegionRows(regionData.results);

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
