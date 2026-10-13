const catalog = document.querySelector<HTMLElement>("#store-catalog");

function requireCatalogElement<T extends Element>(parent: Element, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`The store page is missing ${selector}.`);
  return element;
}

if (catalog) {
  const grid = requireCatalogElement<HTMLElement>(catalog, "#store-grid");
  const searchInput = requireCatalogElement<HTMLInputElement>(catalog, "#store-search");
  const filterSelect = requireCatalogElement<HTMLSelectElement>(catalog, "#store-filter");
  const sortSelect = requireCatalogElement<HTMLSelectElement>(catalog, "#store-sort");
  const resultCount = requireCatalogElement<HTMLElement>(catalog, "#store-count");
  const emptyState = requireCatalogElement<HTMLElement>(catalog, "#store-empty");
  const loadButton = requireCatalogElement<HTMLButtonElement>(catalog, "#store-load-more");
  const sentinel = requireCatalogElement<HTMLElement>(catalog, "#store-scroll-sentinel");

  const pageSize = 8;
  const products = Array.from(grid.querySelectorAll<HTMLElement>(".product-card"));
  let visibleCount = pageSize;
  let matchingProducts = [...products];

  function updateCatalog(resetVisibleCount = true) {
    if (resetVisibleCount) visibleCount = pageSize;
    const query = searchInput.value.trim().toLocaleLowerCase();
    const selectedTag = filterSelect.value;
    const sort = sortSelect.value;

    matchingProducts = products
      .filter((product) => {
        const searchText = product.dataset.productSearch ?? product.dataset.productName ?? "";
        const tag = product.dataset.productTag ?? "";
        return searchText.includes(query) && (!selectedTag || tag === selectedTag);
      })
      .sort((first, second) => {
        const firstPrice = Number(first.dataset.productPrice);
        const secondPrice = Number(second.dataset.productPrice);
        if (sort === "price-low") return firstPrice - secondPrice;
        if (sort === "price-high") return secondPrice - firstPrice;
        if (sort === "name") return (first.dataset.productName ?? "").localeCompare(second.dataset.productName ?? "");
        const featuredDifference =
          Number(second.dataset.productFeatured === "true") - Number(first.dataset.productFeatured === "true");
        if (featuredDifference !== 0) return featuredDifference;
        return products.indexOf(first) - products.indexOf(second);
      });

    products.forEach((product) => {
      product.hidden = true;
      grid.append(product);
    });
    matchingProducts.slice(0, visibleCount).forEach((product) => {
      product.hidden = false;
      grid.append(product);
    });
    emptyState.hidden = matchingProducts.length > 0;
    resultCount.textContent = `${matchingProducts.length} ${matchingProducts.length === 1 ? "chocolate" : "chocolates"}`;
    loadButton.hidden = matchingProducts.length <= visibleCount;
  }

  function loadMore() {
    visibleCount += pageSize;
    updateCatalog(false);
  }

  searchInput.addEventListener("input", () => updateCatalog());
  filterSelect.addEventListener("change", () => updateCatalog());
  sortSelect.addEventListener("change", () => updateCatalog());
  loadButton.addEventListener("click", loadMore);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadButton.hidden) loadMore();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
  }

  updateCatalog();
}
