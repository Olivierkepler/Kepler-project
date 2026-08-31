export function addWaste(
    quantity: number,
    wastePercent: number,
  ) {
    return quantity * (1 + wastePercent / 100);
  }