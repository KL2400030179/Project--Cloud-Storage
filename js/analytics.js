export function buildAnalytics(files, activityItems = []) {
  const categoryCounts = {};

  files.forEach((file) => {
    const category = file.category || "Other";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const sharedCount = new Set(
    activityItems
      .filter((item) => item.action === "SHARE")
      .map((item) => item.file_id)
      .filter(Boolean)
  ).size;

  const duplicateCount = Object.values(
    files.reduce((map, file) => {
      const hash = file.file_hash || "";
      if (!hash) return map;
      map[hash] = (map[hash] || 0) + 1;
      return map;
    }, {})
  ).filter((count) => count > 1).length;

  return {
    totalFiles: files.length,
    totalStorage: files.reduce((sum, file) => sum + Number(file.file_size || 0), 0),
    categoryCounts,
    sharedCount,
    duplicateCount
  };
}

export function renderAnalyticsChart(categoryCounts) {
  const rows = Object.entries(categoryCounts || {});

  const maxCount = Math.max(1, ...rows.map(([, value]) => Number(value || 0)));

  return rows
    .map(([category, count]) => {
      const width = ((Number(count || 0) / maxCount) * 100).toFixed(0);
      return `
        <div class="chart-row">
          <div class="chart-label">
            <span>${category}</span>
            <span>${count}</span>
          </div>
          <div class="chart-bar">
            <div class="chart-fill" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("") || '<div class="empty-state">No analytics data yet.</div>';
}
