// Stands in for the web app in the UI test: shows what the app bridge reports and whether the
// API can be reached.
const show = (lines) => {
  document.body.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
};
const lines = [];
const bridge = window.DoStotinkaApp;
if (bridge) {
  const info = JSON.parse(bridge.getInfo());
  lines.push(`platform:${info.platform}`);
  lines.push(`server:${info.server}`);
} else {
  lines.push('no bridge');
}
show(lines);
fetch('/api/health')
  .then((r) => r.json())
  .then((j) => show([...lines, `api:${j.status}`]))
  .catch(() => show([...lines, 'api:offline']));
