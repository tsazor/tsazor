# Screen-reader audit (E9, the manual part)

The automated part of E9 runs in CI: axe on every page of the gallery and the demo, in light and dark, and keyboard
tests for the dialog, the menu and the tabs ([roadmap-1.0.md](roadmap-1.0.md), E9). What axe can't judge is what a
person with a screen reader hears and can do. This checklist is that audit, against WCAG 2.2 AA, before 1.0.

Expected names, roles, states and keys follow the WAI-ARIA Authoring Practices pattern named for each component.
Whatever differs from it is a finding.

## Setup

- **Screen readers:**
  - NVDA with Firefox and with Edge or Chrome on Windows;
  - VoiceOver with Safari on macOS;
  - optionally, VoiceOver on iOS (touch) and Narrator with Edge as spot checks.
- **The apps:**
  - `pnpm --filter skins dev` (Bootstrap, port 5323) and `pnpm --filter skins dev:fluent` (Fluent, port 5324): the
    same pages in both skins, nearly every component;
  - `pnpm --filter demo dev`: `EditForm` with validation (`/form`, `/validation`), `AuthorizeView` (`/auth`), the
    DataGrid with `Virtualize` (`/virtualize`);
  - an app from `npm create tsazor`: navigation, page titles, `FocusOnNavigate`.
- **Recording:** one row per item in the results table below, per skin and screen reader: pass, or what was
  heard against what was expected. Each finding becomes a fix with a test where a test can catch it.

## What every component must do

- Its **name, role and state** are announced: "Save, button"; "Notifications, switch, on".
- **Focus** is visible, follows the visual order, and is never trapped, except inside a modal dialog.
- A change the user didn't cause with focus is **announced**, through a live region: a toast, a loading result,
  a validation summary.
- **Disabled** and **required** states are announced.
- **Error messages** are tied to their field and read with it.
- Decorative images and icons are silent; meaningful ones have a name.

## Checklist

### Actions (`/actions`)

| Component | Pattern | Check |
|---|---|---|
| Button, icon-only Button | Button | The name is announced; for an icon-only button, the label, not "button" alone |
| ButtonGroup, Toolbar | Toolbar | The group's name; the keys the component documents move between its buttons |
| Dropdown / Menu | Menu button | "button, collapsed, has popup"; Enter or ↓ opens and focuses the first item; arrows, Home/End and typeahead move; Escape closes and returns focus to the button |
| Tooltip | Tooltip | The tip is read when its trigger gets focus, not only on hover |
| Popover | Disclosure or dialog | Opening is announced, its content is reachable, Escape closes and focus returns |

### Overlays (`/overlays`)

| Component | Pattern | Check |
|---|---|---|
| Dialog | Modal dialog | "dialog" and its title on open; focus moves inside; Tab stays inside; Escape closes; focus returns to the trigger |
| Drawer | Modal dialog | As Dialog |
| Overlay, Spinner | Status | The busy state is announced once ("Loading"); the content behind is unreachable while busy |
| Toast (ToastRegion) | Live region (polite) | Each toast is read without stealing focus; its action is reachable; an error toast is announced assertively if it is one |
| Hotkey | — | The shortcut does nothing a screen reader's own keys need (it doesn't swallow NVDA or VoiceOver keys) |

### Forms (`/forms` in both skins; `/form` and `/validation` in the demo)

| Component | Pattern | Check |
|---|---|---|
| TextInput, TextArea, NumberInput | Text field, spin button | Label, required, invalid and its message; a number field's value changes with ↑/↓ and is read |
| Select | Listbox or combobox | Label, the selected option, the options with arrows |
| Checkbox, CheckboxGroup, RadioGroup | Checkbox, radio group | The group's name; checked state; arrows move within a radio group |
| Switch | Switch | "switch, on/off" |
| Slider | Slider | Name, value, min and max; arrows, PageUp/PageDown, Home/End |
| DatePicker, Calendar | Date picker dialog, grid | The field's value as a date; the calendar opens with the date focused; arrows move by day and week; month changes are announced; Escape closes |
| TimePicker, DateInput | Text field or spin button | The value is read as a time or date in the app's culture |
| ColorPicker, ColorPickerInput | — | The chosen color is read as text (its value), not only shown |
| Autocomplete | Combobox | "combobox, collapsed"; typing opens the list; the active option is read; Enter selects; a selected chip is read and can be removed by keyboard |
| Rating, RatingDisplay | Radio group, image | "3 stars, 3 of 5"; arrows change it; the display reads its value |
| FileInput, FileUpload | Button, status | The button's name; the chosen files are read; upload progress and the result are announced |
| Steps, Wizard | — | The current step is announced (`aria-current`); moving to the next step puts focus where the new content starts |
| EditForm, ValidationSummary, ValidationMessage | — | On an invalid submit the summary is read, or `FocusOnInvalidSubmit` moves focus to the first invalid field and its message is read |

### Data (`/data`; the demo's `/virtualize`)

| Component | Pattern | Check |
|---|---|---|
| DataGrid | Table (or grid) | Column headers are read with each cell; sorting is a button with its state ("ascending"); `aria-sort` on the column |
| DataGrid with Virtualize | Table | Rows read in order while scrolling; no duplicate or skipped rows; the row count, if the grid gives one, is right |
| Paginator, Pagination | Navigation | A navigation landmark with a name; the current page is announced (`aria-current`) |
| ListGroup | List | Read as a list with its item count; a clickable item is a link or button |
| Progress | Progress bar | Name and value |

### Structure (`/structure`)

| Component | Pattern | Check |
|---|---|---|
| Accordion, Collapse | Accordion, disclosure | A button with "expanded/collapsed"; the panel follows it in the reading order |
| Tabs | Tabs | "tab, selected, 2 of 4"; arrows move between tabs; the panel is labelled by its tab |
| TreeView | Tree view | "tree item, expanded, level 2"; arrows open, close and move; Home/End |
| Breadcrumb, SidebarNav | Navigation | A navigation landmark with a name; the current page is announced |
| Splitter | Window splitter | "separator", its value; arrows resize |
| SortableList | Listbox or list | Reordering by keyboard works and is announced ("moved to position 3 of 5") |
| Skeleton, Overflow | — | A skeleton is silent or read as loading, not as empty boxes; overflowed items stay reachable |

### Content (`/content`)

| Component | Pattern | Check |
|---|---|---|
| Avatar | Image | The person's name, or silent when the name is next to it |
| Chip, ChipSet | List, button | Each chip's text; its remove button says what it removes |
| Timeline | List | Read as a list, the items in order |
| Carousel | Carousel | Slide "2 of 5"; buttons named; automatic rotation stops on focus and can be paused |
| Image, Link, ScrollToTop | Image, link, button | The alt text; a link's purpose from its text; the button's name |
| Markdown | — | Headings, lists and links keep their semantics |
| Highlighter | — | The highlighted text is read as one text, not split into pieces |

### Charts and icons (`/charts`, `/icons`)

| Component | Pattern | Check |
|---|---|---|
| Chart, Sparkline | Image with a summary | Read as an image with a name and a summary; the data table, where the chart offers one, is reachable |
| Icon | Image | Silent when decorative; its title when it carries meaning |

### Navigation and the app (`npm create tsazor`; the demo's `/auth`)

| Item | Check |
|---|---|
| Page title (`PageTitle`) | The document title changes with the page and is read on navigation |
| `FocusOnNavigate` | After a navigation, focus moves to the page's heading and the heading is read |
| `NavLink` | The current page's link is announced as current (`aria-current="page"`) |
| Holding the previous page (E13) | While the next page loads, nothing confusing is read; the new page is announced once it shows |
| `AuthorizeView` | Content that appears after signing in is announced or reachable |

## Results

| Item | Skin | Screen reader | Result | Finding |
|---|---|---|---|---|
| | | | | |
