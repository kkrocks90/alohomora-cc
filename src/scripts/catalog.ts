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
  const loadingStatus = requireCatalogElement<HTMLElement>(catalog, "#store-loading");
  const sentinel = requireCatalogElement<HTMLElement>(catalog, "#store-scroll-sentinel");
  const searchClear = requireCatalogElement<HTMLButtonElement>(catalog, "#store-search-clear");
  const resetButton = requireCatalogElement<HTMLButtonElement>(catalog, "#store-reset");
  const chips = Array.from(catalog.querySelectorAll<HTMLButtonElement>(".store-chip"));
  const requestedTag = new URL(window.location.href).searchParams.get("category");
  if (requestedTag && Array.from(filterSelect.options).some((option) => option.value === requestedTag)) {
    filterSelect.value = requestedTag;
  }

  function syncChips() {
    chips.forEach((chip) => {
      const active = (chip.dataset.chip ?? "") === filterSelect.value;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
      if (active) {
        const rail = chip.parentElement;
        if (rail) rail.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
      }
    });
  }

  const pageSize = 8;
  const products = Array.from(grid.querySelectorAll<HTMLElement>(".product-card"));
  let visibleCount = pageSize;
  let matchingProducts = [...products];
  let isLoadingMore = false;

  function updateResults() {
    emptyState.hidden = matchingProducts.length > 0;
    resultCount.textContent = `Showing ${Math.min(visibleCount, matchingProducts.length)} of ${matchingProducts.length} ${matchingProducts.length === 1 ? "treat" : "treats"}`;
    loadButton.hidden = matchingProducts.length <= visibleCount;
  }

  function updateCatalog() {
    visibleCount = pageSize;
    searchClear.hidden = searchInput.value.length === 0;
    syncChips();
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
    updateResults();
  }

  async function loadMore() {
    if (isLoadingMore || visibleCount >= matchingProducts.length) return;
    isLoadingMore = true;
    loadButton.disabled = true;
    loadingStatus.hidden = false;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const nextVisibleCount = Math.min(visibleCount + pageSize, matchingProducts.length);
    matchingProducts.slice(visibleCount, nextVisibleCount).forEach((product) => {
      product.hidden = false;
      grid.append(product);
    });
    visibleCount = nextVisibleCount;
    updateResults();
    loadingStatus.hidden = true;
    loadButton.disabled = false;
    isLoadingMore = false;
  }

  searchInput.addEventListener("input", () => updateCatalog());
  filterSelect.addEventListener("change", () => updateCatalog());
  sortSelect.addEventListener("change", () => updateCatalog());
  loadButton.addEventListener("click", loadMore);
  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      filterSelect.value = chip.dataset.chip ?? "";
      updateCatalog();
    }),
  );
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    updateCatalog();
    searchInput.focus();
  });
  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    filterSelect.value = "";
    sortSelect.value = "featured";
    updateCatalog();
  });

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
