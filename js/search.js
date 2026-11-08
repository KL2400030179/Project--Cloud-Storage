export function filterFiles(files, searchText = "", category = "all", sortOption = "newest", fileType = "all") {
  const query = (searchText || "").trim().toLowerCase();

  const filtered = files.filter((file) => {
    const matchesText = !query || [
      file.file_name,
      file.file_type,
      file.category,
      file.mime_type
    ].some((value) => String(value || "").toLowerCase().includes(query));

    const matchesCategory = category === "all" || file.category === category;
    const matchesType = fileType === "all" || file.file_type === fileType;
    return matchesText && matchesCategory && matchesType;
  });

  const sorted = [...filtered];

  sorted.sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();

    switch (sortOption) {
      case "oldest":
        return timeA - timeB;
      case "largest":
        return Number(b.file_size || 0) - Number(a.file_size || 0);
      case "smallest":
        return Number(a.file_size || 0) - Number(b.file_size || 0);
      case "name-asc":
        return (a.file_name || "").localeCompare(b.file_name || "");
      case "newest":
      default:
        return timeB - timeA;
    }
  });

  return sorted;
}
