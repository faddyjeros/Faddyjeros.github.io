# Finance App — Design System

## Aesthetic

Industrial/Utilitarian meets Brutally Minimal. Clean, modern, Linear/Vercel energy.
Lots of whitespace, minimal chrome, elegant typography. Effortless sophistication.

## Colors

### Dark mode (default)

| Token          | Value     | Usage                        |
| -------------- | --------- | ---------------------------- |
| `bg`           | `#09090b` | Page background              |
| `surface`      | `#18181b` | Cards, panels, inputs        |
| `surface-hover`| `#1f1f23` | Hover states on surfaces     |
| `border`       | `#27272a` | Card borders, dividers       |
| `border-subtle`| `#1e1e21` | Table row separators         |
| `text`         | `#fafafa` | Primary text                 |
| `text-secondary`| `#a1a1aa`| Supporting text              |
| `text-muted`   | `#71717a` | Placeholders, captions       |
| `accent`       | `#10b981` | Emerald — primary accent     |
| `accent-hover` | `#34d399` | Accent hover state           |
| `accent-muted` | `rgba(16,185,129,0.12)` | Accent backgrounds |
| `danger`       | `#ef4444` | Negative values, errors      |
| `danger-muted` | `rgba(239,68,68,0.12)` | Danger backgrounds  |
| `warning`      | `#f59e0b` | Warnings, caution            |
| `info`         | `#3b82f6` | Informational                |

### Light mode

| Token          | Value     | Usage                        |
| -------------- | --------- | ---------------------------- |
| `bg`           | `#fafafa` | Page background              |
| `surface`      | `#ffffff` | Cards, panels                |
| `surface-hover`| `#f4f4f5` | Hover states                 |
| `border`       | `#e4e4e7` | Borders, dividers            |
| `border-subtle`| `#f0f0f2` | Subtle separators            |
| `text`         | `#09090b` | Primary text                 |
| `text-secondary`| `#52525b`| Supporting text              |
| `text-muted`   | `#a1a1aa` | Placeholders, captions       |
| `accent`       | `#059669` | Deeper emerald for contrast  |
| `accent-hover` | `#10b981` | Accent hover state           |

Theme is stored in `localStorage` and toggled via a Light/Dark pill button.

## Typography

- **Display & headings**: Geist Sans, 600–700 weight, tight tracking (-0.02em to -0.03em)
- **Body & UI**: Geist Sans, 400–500 weight, 14px base, 1.6 line-height
- **Financial data**: Geist Mono, 400–500 weight — all monetary values, dates, percentages, ticker symbols
- **Labels**: Geist Sans, 11–12px, 500 weight, uppercase, 0.04em letter-spacing

Load from Google Fonts CDN:
```
fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500
```

## Layout

### Desktop (≥768px)

- **Sidebar navigation**: 220px fixed width, left side, full height
- Sidebar brand: emerald dot + "Finance" label
- Nav items: 13px, left border accent on active, hover background
- User info at bottom with last sync time
- **Main content**: flex: 1, max-width 1100px, padding 32px 40px

### Mobile (<768px)

- Sidebar collapses into **horizontal scrollable tab bar**
- Tabs: 12px font, bottom border accent on active
- **Scrollbar must be hidden** (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) — swipe to navigate
- Nav icons hidden on mobile
- Main content: padding 20px 16px
- KPI grid: 2 columns (1 column below 480px)
- Charts: single column stack

### Grid

- KPI cards: 4 columns desktop, 2 columns tablet, 1 column phone
- Charts: 2 columns desktop, 1 column mobile
- Max content width: 1100px
- Base spacing unit: 4px

## Components

### KPI cards

- Background: `surface`
- Border: 1px solid `border`, 8px radius
- Padding: 20px
- Label: 12px uppercase muted
- Value: Geist Mono, 28px (22px mobile), 600 weight
- Delta: 12px Geist Mono, colored by direction (accent=up, danger=down)

### Chart cards

- Same container as KPI cards
- Title: 13px, 500 weight
- Subtitle: 11px muted
- Use recharts for all data visualization
- Area charts: emerald fill at 15% opacity, 2px stroke
- Bar charts: emerald with decreasing opacity per rank

### Data tables

- Surface background, border, 8px radius, overflow hidden
- Header row with title + action button
- Column headers: 11px uppercase muted, 0.04em tracking
- Cells: 13px, 12px vertical padding
- Row hover: `surface-hover` background
- Amounts: Geist Mono, right-aligned, 500 weight
- Dates: Geist Mono, 12px muted
- Category tags: 11px, 4px radius, accent-muted bg for income, tag-bg for expenses

### Buttons

| Variant   | Background            | Text            | Border              |
| --------- | --------------------- | --------------- | ------------------- |
| Primary   | `accent`              | `#09090b`       | none                |
| Secondary | transparent           | `text`          | 1px solid `border`  |
| Ghost     | transparent           | `text-secondary`| none                |
| Danger    | `danger-muted`        | `danger`        | none                |

All buttons: 6px radius, 13px font, 500 weight, 8px 16px padding, 150ms transition.

### Form inputs

- Background: `bg`
- Border: 1px solid `border`, 6px radius
- Focus: border-color transitions to `accent`
- Padding: 8px 12px
- Amount inputs use Geist Mono

### Alerts

- 6px radius, 1px border, 12px 16px padding, 13px font
- Success: emerald tint bg, emerald border, emerald text
- Warning: amber tint bg, amber border, amber text
- Error: red tint bg, red border, red text
- Info: blue tint bg, blue border, blue text

## Navigation items

Sidebar contains these pages in order:
1. Dashboard
2. Analyst (AI analysis)
3. Wealth (net worth, portfolio, accounts)
4. Salary
5. Transactions
6. Budgets
7. Alerts
8. Categorize

## Motion

- Transitions: 150ms ease-out for interactions, 200ms ease-out for theme/layout changes
- No decorative animations
- Functional only: hover states, focus rings, theme transitions

## Decoration

- Borders: 1px solid, no fills or shadows
- No gradients, no box-shadows, no glow effects
- Border radius: 6px for controls, 8px for cards
- Accent dot (8px emerald circle) in brand mark only
