/**
 * Opens a file that needs the user's token (so it can't be a plain link) in a new tab. The tab is opened during
 * the click, which popup blockers allow, and the file is loaded into it once downloaded. If the browser blocks
 * the tab anyway, the file is downloaded instead.
 */
export async function openInNewTab(load: () => Promise<Blob>, fileName: string): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await load());
    if (tab) {
      tab.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
    }
    // The tab has read the file long before this; free the memory
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
