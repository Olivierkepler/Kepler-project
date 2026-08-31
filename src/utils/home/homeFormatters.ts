export function formatSignedCurrency(
    value: number,
  ): string {
    if (value === 0) {
      return "$0.00";
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  }
  
  export function formatSignedDays(
    value: number,
  ): string {
    const absolute = Math.abs(value).toFixed(2);
  
    const unitLabel =
      Math.abs(value) === 1 ? "day" : "days";
  
    if (value === 0) {
      return `0.00 ${unitLabel}`;
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}${absolute} ${unitLabel}`;
  }
  
  export function formatSignedHours(
    value: number,
  ): string {
    if (value === 0) {
      return "0.00 hr";
    }
  
    const sign = value > 0 ? "+" : "-";
  
    return `${sign}${Math.abs(value).toFixed(2)} hr`;
  }
  
  export function formatSignedValue(
    value: number,
    unit: string,
  ): string {
    const sign = value > 0 ? "+" : "";
  
    return `${sign}${value.toFixed(2)} ${unit}`;
  }
  
  export function clampProgress(
    progress: number,
  ): number {
    return Math.min(
      100,
      Math.max(0, progress),
    );
  }