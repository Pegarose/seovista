module.exports = async (browser, { url }) => {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.close();
};
