import { useEffect, useState } from "react";

// Cohesive, emerald-anchored category palette. Replaces the old neon set
// (#f72585 magenta, #ffd166 yellow, #4361ee indigo) which clashed with the
// design system. Fixed Costs leads with the brand emerald; the rest are a
// harmonious 500-level set that stays legible on both dark and light surfaces.
export const CATEGORY_COLORS = {
  "Income":             "#10b981", // emerald (positive / brand)
  "Fixed Costs":        "#0ea5e9", // sky
  "Groceries & Dining": "#f59e0b", // amber
  "Travel":             "#8b5cf6", // violet
  "Fun Money":          "#f43f5e", // rose
  "Savings":            "#14b8a6", // teal (growth)
  "Internal Transfer":  "#71717a", // zinc (neutral)
  "Miscellaneous":      "#a1a1aa", // zinc (neutral)
};

// Brand emerald for single-series accents (net worth, salary, advice lines).
export const CHART_ACCENT = "#10b981";
export const CHART_POSITIVE = "#10b981";
export const CHART_NEGATIVE = "#ef4444";

function readRGB(varName, fallback) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `rgb(${v})` : fallback;
}

// Returns chart chrome colors (grid, axes, tooltip) resolved from the active
// theme's CSS variables, and re-resolves when the light/dark class flips.
export function useChartTheme() {
  const [, force] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => force((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return {
    grid: readRGB("--color-border", "#27272a"),
    axis: readRGB("--color-text-muted", "#71717a"),
    text: readRGB("--color-text", "#fafafa"),
    accent: CHART_ACCENT,
    tooltip: {
      background: readRGB("--color-surface", "#18181b"),
      border: `1px solid ${readRGB("--color-border", "#27272a")}`,
      borderRadius: 8,
      color: readRGB("--color-text", "#fafafa"),
    },
  };
}
