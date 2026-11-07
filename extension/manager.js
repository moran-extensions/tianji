const $ = id => document.getElementById(id);
let data, pageSize = 50, pendingDelete = null, busy = false;
async function send(type, extra = {}) { const value = await chrome.runtime.sendMessage({ type, ...extra }); if (!value?.ok) throw new Error(value?.error || '操作未完成'); return value.data; }
const element = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
function message(text) { $('message').textContent = text; $('message').hidden = !text; }
async function refresh() {
  data = await send('MANAGER_GET');
  const selected = $('site-filter').value;
  const origins = [...new Set([...Object.keys(data.sites), ...data.fields.map(row => row.origin)])].sort();
  $('site-filter').replaceChildren(new Option('全部站点', ''), ...origins.map(origin => new Option(origin + (data.sites[origin]?.enabled ? ' · 记录中' : ' · 已暂停'), origin)));
  $('site-filter').value = origins.includes(selected) ? selected : ''; render();
}
function confirm(title, copy, action) { $('confirm-title').textContent = title; $('confirm-copy').textContent = copy; pendingDelete = action; $('confirm-dialog').showModal(); }
async function remove(fieldId, itemId) {
  try { await send('MANAGER_DELETE', { fieldId, itemId }); await refresh(); } catch (error) { message(error.message); }
}
function render() {
  const origin = $('site-filter').value, query = $('search').value.toLocaleLowerCase().trim();
  const fields = data.fields.filter(row => (!origin || row.origin === origin) && `${row.origin} ${row.path} ${row.label} ${row.items.map(item => item.value).join(' ')}`.toLocaleLowerCase().includes(query)).sort((a, b) => b.updatedAt - a.updatedAt);
  $('summary').textContent = `共 ${fields.length} 个字段，${fields.reduce((n, row) => n + row.items.length, 0)} 条历史值`;
  $('clear-site').hidden = !origin || !data.fields.some(row => row.origin === origin); $('fields').replaceChildren(); $('empty').hidden = Boolean(fields.length);
  if (!fields.length) $('empty').textContent = query || origin ? '没有匹配的记录。' : '还没有历史记录。打开需要使用的网页，点击扩展启用本站，然后在普通输入框输入一次。';
  for (const row of fields.slice(0, pageSize)) {
    const details = element('details', undefined, 'field-card'), summary = element('summary'), heading = element('div'), name = element('strong', row.label), count = element('span', `${row.items.length} 条`, 'count');
    const info = element('span', `${row.origin}${row.path}`, 'field-meta'); heading.append(name, count, info);
    const clear = element('button', '删除字段', 'danger-link'); clear.type = 'button';
    clear.onclick = event => { event.preventDefault(); event.stopPropagation(); confirm('删除这个字段的全部历史？', `${row.label} · ${row.items.length} 条记录。此操作不会修改网页。`, () => remove(row.id)); };
    summary.append(heading, clear); details.append(summary);
    let rendered = false;
    details.addEventListener('toggle', () => {
      if (!details.open || rendered) return; rendered = true;
      const list = element('div', undefined, 'saved-values');
      for (const item of row.items) {
        const line = element('div', undefined, 'saved-row'), content = element('code', item.value), removeButton = element('button', '删除', 'quiet'); removeButton.type = 'button';
        removeButton.setAttribute('aria-label', `删除 ${row.label} 的这条记录`); removeButton.onclick = () => remove(row.id, item.id);
        line.append(content, removeButton); list.append(line);
      }
      details.append(list);
    });
    $('fields').append(details);
  }
  $('more').hidden = fields.length <= pageSize;
}
$('search').oninput = () => { pageSize = 50; render(); };
$('site-filter').onchange = () => { pageSize = 50; render(); };
$('more').onclick = () => { pageSize += 50; render(); };
$('clear-site').onclick = () => { const origin = $('site-filter').value; if (origin) confirm('清空这个站点的全部记录？', origin + ' 的输入历史将从插件删除，其他站点和原网页不受影响。', async () => { await send('SITE_CLEAR', { origin }); await refresh(); }); };
$('confirm-delete').onclick = async () => {
  if (!pendingDelete || busy) return; busy = true; $('confirm-delete').disabled = true;
  try { await pendingDelete(); $('confirm-dialog').close(); } catch (error) { message(error.message); }
  finally { busy = false; $('confirm-delete').disabled = false; pendingDelete = null; }
};
$('confirm-cancel').onclick = () => { pendingDelete = null; $('confirm-dialog').close(); };
$('privacy').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
void refresh().catch(error => message(error.message));
