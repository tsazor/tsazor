/**
 * @tsazor/ui/kit: the helpers of the skins' components — calendar and time math, color conversion, the components'
 * keyboard maps and label builders, form-field state. Not covered by the stability promise (docs/support-policy.md,
 * D-S7): released in lockstep with the skins, they may change in any release. A library that builds on them (or a
 * component copied into an app) depends on @tsazor/ui at an exact version.
 */

export { englishLibraryTexts, libraryPlural, libraryText } from "./library-texts.js";
export { isRightToLeft, logicalArrowKey } from "./direction.js";
export { iconSize } from "./icons.js";
export { nextChipSelection } from "./chips.js";
export { resizeSplitter, splitterKeyDelta, splitterPercent } from "./splitter.js";
export { sliderFraction, sliderTicks } from "./slider.js";
export { highlightFragments, highlightTerms, type HighlightFragment, type HighlightOptions } from "./highlight.js";
export {
  formatRatingCount,
  formatRatingValue,
  ratingClickValue,
  ratingFill,
  ratingKeyTarget,
  ratingLabelsFrom,
} from "./rating.js";
export { hotkeyApplies, isApplePlatform, isTypingTarget, matchesHotkey, parseHotkey } from "./hotkeys.js";
export {
  closestColor,
  colorPickerLabelsFrom,
  describeColor,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsv,
  swatchKeyTarget,
  wheelKeyTarget,
  wheelLayout,
  type Hsv,
  type Rgb,
  type WheelLayout,
} from "./color.js";
export { swatchPalette, wheelPalette, wheelRowSizes } from "./color-palettes.js";
export { carouselLabelsFrom, carouselRotates, carouselStep, carouselSwipe } from "./carousel.js";
export { maskInput, toMask } from "./mask.js";
export { localizeNumberText, numberSeparators } from "./number-text.js";
export { optionAtValue, selectedOptionIndex } from "./select-items.js";
export { nextPickerDraft, orderedRange } from "./date-range.js";
export { overflowFit } from "./overflow.js";
export {
  edgeEnabledOption,
  formatTimeField,
  formatTimePickerValue,
  initialTimeOption,
  nextEnabledOption,
  normalizeIsoTime,
  parseTimeField,
  timeFieldPlaceholder,
  timeOptions,
} from "./time.js";
export {
  addDays,
  addMonths,
  addYears,
  calendarKeyTarget,
  calendarLabelsFrom,
  calendarWeeks,
  calendarYears,
  clampDate,
  dateFieldPlaceholder,
  datesOfRange,
  dayOfWeek,
  daysInMonth,
  firstDayOfWeek,
  formatDateField,
  formatIsoDate,
  formatPickerValue,
  isDateDisabled,
  isMonthDisabled,
  isYearDisabled,
  monthNames,
  nextDateRange,
  nextMultipleDates,
  parseDateField,
  pageLocale,
  parsePickerValue,
  rangeOfDates,
  startOfMonth,
  startOfWeek,
  weekdayNames,
  type DateLimits,
  type DateRange,
} from "./calendar.js";
export { fileUploadLabelsFrom, runFileUpload, type FileUploadCallbacks, type FileUploadOptions } from "./file-upload.js";
export {
  moveItem,
  sortableInsertIndex,
  sortableList,
  sortableListLabelsFrom,
  type SortableListHandle,
} from "./sortable.js";
export { isWizardStepClickable, nextWizardStep, previousWizardStep, wizardLabelsFrom, wizardStepStatus } from "./wizard.js";
export { avatarColorFor, avatarIconSize, avatarInitials } from "./avatar.js";
export {
  overlayBackground,
  overlayBehavior,
  overlayClosesOn,
  type OverlayBehaviorOptions,
  type OverlayPress,
} from "./behaviors/overlay.js";
export { ImmediateInput } from "./behaviors/immediate.js";
export { computePosition } from "./behaviors/anchored-position.js";
export { FieldState, hasSubmitAttempt, markSubmitAttempt, type FieldValidity } from "./forms.js";
export {
  hasChildren,
  initiallyExpanded,
  treeKeyAction,
  treePath,
  treeTabStop,
  visibleTreeItems,
  type TreeKeyAction,
  type VisibleTreeItem,
} from "./tree.js";
export { compareValues, gridFilterMatches, propertyPath, propertyTitle, toggleAll, toggleSelection } from "./data-grid.js";
export { SearchRunner, comboboxKeyAction, filterOptions, toggleOption, type ComboboxKeyAction } from "./combobox.js";
