interface CatalogueProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  images: string[];
  tag: string;
  extraTags?: string[];
  packSize: string;
  dimensions?: string;
  weight?: string;
  flavours: string[];
  featured: boolean;
  customizable?: boolean;
  active: boolean;
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  uploadImage: (file: Blob) => Promise<string>;
  setStatus: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
  getCategories: () => string[];
}

interface FlavourOption {
  name: string;
  extraPercent: number;
}

const MAX_IMAGES = 3;
const MAX_EDGE = 1600;

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

export function isCatalogueProduct(value: unknown): value is CatalogueProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === "string" && typeof product.name === "string" &&
    typeof product.price === "number" && Array.isArray(product.images) &&
    Array.isArray(product.flavours) && typeof product.tag === "string";
}

// Shrinks phone photos in the browser so uploads stay small and the storefront loads fast.
async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg", 0.88);
  if (!jpeg) throw new Error("That photo could not be processed.");
  return jpeg;
}

export function initProductsAdmin({ root, post, uploadImage, setStatus, reload, getCategories }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-product-form");
  const heading = required<HTMLElement>(root, "#admin-product-form-title");
  const photos = required<HTMLElement>(root, "#admin-product-photos");
  const photoInput = required<HTMLInputElement>(root, "#admin-product-photo-input");
  const categoryList = required<HTMLDataListElement>(root, "#admin-product-categories");
  const flavourList = required<HTMLElement>(root, "#admin-product-flavours");
  const submit = required<HTMLButtonElement>(root, "#admin-product-submit");
  const cancel = required<HTMLButtonElement>(root, "#admin-product-cancel");
  const list = required<HTMLElement>(root, "#admin-product-list");
  const publish = required<HTMLButtonElement>(root, "#admin-product-publish");
  const publishHint = required<HTMLElement>(root, "#admin-product-publish-hint");
  let products: CatalogueProduct[] = [];
  let images: string[] = [];
  let editingId: string | null = null;
  let uploading = false;
  let flavourOptions: FlavourOption[] = [];

  function field<T extends HTMLElement>(name: string) {
    return form.elements.namedItem(name) as unknown as T;
  }

  function checkedFlavours() {
    return Array.from(flavourList.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => input.value);
  }

  function renderFlavours(selected: string[]) {
    const known = new Set(flavourOptions.map((option) => option.name));
    const options = [...flavourOptions, ...selected.filter((name) => !known.has(name)).map((name) => ({ name, extraPercent: 0 }))];
    flavourList.replaceChildren();
    if (options.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-form-hint";
      empty.textContent = "No flavours yet. Add them in the Flavours section below.";
      flavourList.append(empty);
      return;
    }
    for (const option of options) {
      const label = document.createElement("label");
      label.className = "apf-flavour-chip";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = option.name;
      input.checked = selected.includes(option.name);
      const text = document.createElement("span");
      text.textContent = option.extraPercent > 0 ? `${option.name} (+${option.extraPercent}%)` : option.name;
      label.append(input, text);
      flavourList.append(label);
    }
  }

  function renderPhotos() {
    photos.replaceChildren();
    for (let index = 0; index < MAX_IMAGES; index++) {
      const url = images[index];
      if (url === undefined) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "admin-photo-slot";
        slot.disabled = uploading || index > images.length;
        const busy = uploading && index === images.length;
        const plus = document.createElement("span");
        plus.setAttribute("aria-hidden", "true");
        plus.textContent = busy ? "\u2026" : "+";
        const label = document.createElement("small");
        label.textContent = busy ? "Uploading" : index === 0 ? "Add main photo" : "Add photo";
        slot.append(plus, label);
        slot.addEventListener("click", () => photoInput.click());
        photos.append(slot);
        continue;
      }
      const tile = document.createElement("figure");
      tile.className = "admin-photo-tile";
      if (/^https?:\/\//.test(url)) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = `Product photo ${index + 1}`;
        tile.append(img);
      } else {
        const missing = document.createElement("span");
        missing.textContent = url;
        tile.append(missing);
      }
      if (index === 0) {
        const badge = document.createElement("span");
        badge.className = "admin-photo-badge";
        badge.textContent = "Main";
        tile.append(badge);
      }
      const caption = document.createElement("figcaption");
      if (index > 0) {
        const main = document.createElement("button");
        main.type = "button";
        main.textContent = "Make main";
        main.addEventListener("click", () => {
          images = [url, ...images.filter((_, imageIndex) => imageIndex !== index)];
          renderPhotos();
        });
        caption.append(main);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        images = images.filter((_, imageIndex) => imageIndex !== index);
        renderPhotos();
      });
      caption.append(remove);
      tile.append(caption);
      photos.append(tile);
    }
  }

  function resetForm() {
    editingId = null;
    form.reset();
    images = [];
    renderFlavours([]);
    field<HTMLInputElement>("active").checked = true;
    field<HTMLInputElement>("customizable").checked = true;
    heading.textContent = "Add a product";
    submit.textContent = "Add product";
    cancel.hidden = true;
    renderPhotos();
  }

  function startEdit(product: CatalogueProduct) {
    editingId = product.id;
    field<HTMLInputElement>("name").value = product.name;
    field<HTMLTextAreaElement>("description").value = product.description;
    field<HTMLInputElement>("price").value = String(product.price);
    field<HTMLInputElement>("packSize").value = product.packSize;
    field<HTMLInputElement>("dimensions").value = product.dimensions ?? "";
    field<HTMLInputElement>("weight").value = product.weight ?? "";
    field<HTMLInputElement>("tag").value = product.tag;
    field<HTMLInputElement>("extraTags").value = (product.extraTags ?? []).join(", ");
    renderFlavours(product.flavours);
    field<HTMLInputElement>("featured").checked = product.featured;
    field<HTMLInputElement>("customizable").checked = product.customizable !== false;
    field<HTMLInputElement>("active").checked = product.active;
    images = [...product.images];
    heading.textContent = `Edit ${product.name}`;
    submit.textContent = "Save changes";
    cancel.hidden = false;
    renderPhotos();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    field<HTMLInputElement>("name").focus({ preventScroll: true });
  }

  function renderList() {
    list.replaceChildren();
    for (const product of products) {
      const card = document.createElement("article");
      card.className = "admin-product-card";
      if (!product.active) card.classList.add("is-hidden");
      const thumb = document.createElement("div");
      thumb.className = "admin-product-thumb";
      if (/^https?:\/\//.test(product.image)) {
        const img = document.createElement("img");
        img.src = product.image;
        img.alt = "";
        img.loading = "lazy";
        thumb.append(img);
      }
      const info = document.createElement("div");
      info.className = "admin-product-info";
      const title = document.createElement("strong");
      title.textContent = product.name;
      const meta = document.createElement("span");
      const photoCount = product.images.length;
      meta.textContent = `₹${product.price} · ${product.tag} · ${photoCount} photo${photoCount === 1 ? "" : "s"}${product.active ? "" : " · Hidden"}`;
      info.append(title, meta);
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-secondary admin-product-edit";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(product));
      card.append(thumb, info, edit);
      list.append(card);
    }
  }

  photoInput.addEventListener("change", async () => {
    const files = Array.from(photoInput.files ?? []).slice(0, MAX_IMAGES - images.length);
    photoInput.value = "";
    if (files.length === 0) return;
    uploading = true;
    renderPhotos();
    try {
      for (const file of files) {
        setStatus("Uploading photo…");
        const url = await uploadImage(await resizePhoto(file));
        images = [...images, url];
        renderPhotos();
      }
      setStatus("Photo uploaded. Save the product to keep it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The photo could not be uploaded.", true);
    } finally {
      uploading = false;
      renderPhotos();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (uploading) {
      setStatus("Wait for the photo upload to finish.", true);
      return;
    }
    const data = new FormData(form);
    const lines = (value: FormDataEntryValue | null, separator: RegExp) =>
      String(value ?? "").split(separator).map((item) => item.trim()).filter(Boolean);
    const payload = {
      ...(editingId ? { productId: editingId } : {}),
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price")),
      packSize: String(data.get("packSize") ?? ""),
      dimensions: String(data.get("dimensions") ?? ""),
      weight: String(data.get("weight") ?? ""),
      tag: String(data.get("tag") ?? ""),
      extraTags: lines(data.get("extraTags"), /,/),
      flavours: checkedFlavours(),
      images,
      featured: field<HTMLInputElement>("featured").checked,
      customizable: field<HTMLInputElement>("customizable").checked,
      active: field<HTMLInputElement>("active").checked,
    };
    submit.disabled = true;
    try {
      const result = await post(editingId ? "/admin/products/update" : "/admin/products/create", payload);
      const rebuilt = result.rebuildTriggered === true;
      setStatus(
        rebuilt
          ? "Product saved. The storefront is updating and will show it in about a minute."
          : "Product saved. Use “Publish to storefront” to show it to customers.",
      );
      resetForm();
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The product could not be saved.", true);
    } finally {
      submit.disabled = false;
    }
  });

  cancel.addEventListener("click", resetForm);

  publish.addEventListener("click", async () => {
    publish.disabled = true;
    try {
      await post("/admin/products/publish");
      setStatus("Storefront update started. It will be live in about a minute.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The storefront update could not be started.", true);
    } finally {
      publish.disabled = false;
    }
  });

  resetForm();

  return {
    render(next: CatalogueProduct[], rebuildConfigured: boolean, flavours: FlavourOption[] = []) {
      products = next;
      flavourOptions = flavours;
      renderFlavours(checkedFlavours());
      categoryList.replaceChildren(...getCategories().map((category) => new Option(category)));
      publishHint.textContent = rebuildConfigured
        ? "Saving a product updates the storefront automatically (about a minute)."
        : "Automatic storefront updates are not set up yet, so changes appear on the site after the next manual publish. Orders always use the latest prices.";
      renderList();
    },
  };
}
