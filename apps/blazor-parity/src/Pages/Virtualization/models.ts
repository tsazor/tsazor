/**
 * The item types of the test pages: the nested C# classes of the Razor pages (TypeScript has no nested
 * classes). Their properties stay mutable where the pages mutate them.
 */

/** VirtualizationAnchorMode and VirtualizationAnchorModeWindowScroll. */
export interface DynamicItem {
  index: number;
  height: number;
}

/** VirtualizationDynamicContent. */
export interface ExpandableItem {
  index: number;
  height: number;
  isExpanded: boolean;
}

/** VirtualizationBimodal, VirtualizationScrollBehavior, VirtualizationVariableHeight and VirtualizationDisplayModes. */
export interface HeightItem {
  index: number;
  height: number;
  hue: number;
}

/** VirtualizationVariableHeightAsync: the id stays while the index is recalculated after an insert or a removal. */
export interface VariableHeightItem {
  id: number;
  index: number;
  height: number;
  hue: number;
}

/** VirtualizationNestedVariableHeight: an outer row with its inner list. */
export interface OuterItem {
  index: number;
  height: number;
  hue: number;
  children: HeightItem[];
}

/** VirtualizationChatListAsync. */
export interface ChatMessage {
  id: number;
  index: number;
  height: number;
  hue: number;
}

/** VirtualizationTableScrollWithAppend. */
export interface ScrollItem {
  index: number;
}

/** VirtualizationMaxItemCount (Blazor's `record MyThing(int Id, string Name)`). */
export interface MyThing {
  readonly id: number;
  readonly name: string;
}

/** VirtualizationDataChanges. */
export class Person {
  constructor(
    readonly id: number,
    public name: string,
    public lastName: string,
    public email: string,
    public dateOfBirth: Date,
  ) {}

  /** Blazor's `GeneratePerson(index)`: a person whose fields all derive from the index, born today. */
  static generate(index: number): Person {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Person(index, `Person ${index}`, `Last Name ${index}`, `person${index}@example.com`, today);
  }

  mutate(): void {
    this.name += " MUTATED";
  }

  /**
   * Blazor's `Person.Equals` (same `Id`). C#'s default comparer uses it, so Virtualize's prepend detection
   * treats a refreshed `Person` as the same item; in TypeScript the page passes it as `ItemComparer`.
   */
  static same(a: Person, b: Person): boolean {
    return a.id === b.id;
  }
}
