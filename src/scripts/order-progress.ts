const STEPS: Array<[string, string]> = [
  ["received", "Received"],
  ["confirmed", "Confirmed"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["out_for_delivery", "On the way"],
  ["delivered", "Delivered"],
];

export function buildOrderProgress(orderStatus: string | undefined): HTMLElement | null {
  if (orderStatus === "cancelled") return null;
  const current = Math.max(0, STEPS.findIndex(([key]) => key === orderStatus));
  const list = document.createElement("ol");
  list.className = "order-progress";
  list.setAttribute("aria-label", `Order progress: ${STEPS[current][1]}`);
  STEPS.forEach(([, label], index) => {
    const step = document.createElement("li");
    step.textContent = label;
    if (index < current) step.className = "is-done";
    if (index === current) step.className = "is-current";
    list.append(step);
  });
  return list;
}
