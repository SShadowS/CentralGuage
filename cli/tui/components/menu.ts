/**
 * Menu Component - Vertical menu with keyboard navigation
 */
import { Computed, Signal } from "tui";
import { Button } from "tui/components";
import type { Tui } from "tui";
import { layout, theme } from "../theme.ts";

export interface MenuItem {
  label: string;
  description?: string;
  action: () => void;
  disabled?: boolean;
}

export interface MenuOptions {
  parent: Tui;
  items: MenuItem[];
  startRow?: number;
  startCol?: number;
  width?: number;
  selectedIndex?: Signal<number>;
}

export interface MenuResult {
  selectedIndex: Signal<number>;
  buttons: Button[];
  cleanup: () => void;
}

export function createMenu(options: MenuOptions): MenuResult {
  const {
    parent,
    items,
    startRow = 6,
    startCol = layout.padding + 2,
    width = layout.menuWidth,
  } = options;

  const selectedIndex = options.selectedIndex ?? new Signal(0);
  const buttons: Button[] = [];
  const keydownHandler = createKeydownHandler(
    selectedIndex,
    items,
    parent,
    buttons,
  );

  // Create menu items
  items.forEach((item, index) => {
    const isSelected = new Computed(() => selectedIndex.value === index);

    const button = new Button({
      parent,
      label: {
        text: new Computed(() => {
          const prefix = isSelected.value ? ">" : " ";
          return `${prefix} ${item.label}`;
        }),
      },
      theme: {
        base: theme.menuItem.base,
        focused: theme.menuItem.focused,
        active: theme.menuItem.active,
        disabled: theme.button.disabled,
      },
      rectangle: {
        column: startCol,
        row: startRow + index * 2,
        height: 1,
        width,
      },
      zIndex: 0,
    });

    // Handle button activation (click or enter)
    button.state.when("active", () => {
      if (!item.disabled) {
        selectedIndex.value = index;
        item.action();
      }
    });

    // Handle focus
    button.on("mousePress", () => {
      selectedIndex.value = index;
    });

    buttons.push(button);
  });

  // Add keyboard listener
  parent.on("keyPress", keydownHandler);

  return {
    selectedIndex,
    buttons,
    cleanup: () => {
      parent.off("keyPress", keydownHandler);
      buttons.forEach((b) => b.destroy());
    },
  };
}

function createKeydownHandler(
  selectedIndex: Signal<number>,
  items: MenuItem[],
  _parent: Tui,
  buttons: Button[],
): (
  event: { key: string; ctrl: boolean; meta: boolean; shift: boolean },
) => void {
  return (event) => {
    const { key } = event;
    const current = selectedIndex.peek();

    switch (key) {
      case "up":
      case "k": {
        // Move up, skip disabled items
        let next = current - 1;
        while (next >= 0 && items[next]?.disabled) {
          next--;
        }
        if (next >= 0) {
          selectedIndex.value = next;
          updateButtonFocus(buttons, next);
        }
        break;
      }
      case "down":
      case "j": {
        // Move down, skip disabled items
        let next = current + 1;
        while (next < items.length && items[next]?.disabled) {
          next++;
        }
        if (next < items.length) {
          selectedIndex.value = next;
          updateButtonFocus(buttons, next);
        }
        break;
      }
      case "return":
      case "enter": {
        const item = items[current];
        if (item && !item.disabled) {
          item.action();
        }
        break;
      }
    }
  };
}

function updateButtonFocus(buttons: Button[], focusIndex: number): void {
  buttons.forEach((button, index) => {
    if (index === focusIndex) {
      button.state.value = "focused";
    } else {
      button.state.value = "base";
    }
  });
}
