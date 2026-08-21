import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/utils";
import "./flower-menu.css";

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  key?: string;
  subItems?: MenuItem[];
};

interface FlowerMenuProps extends React.HTMLAttributes<HTMLElement> {
  menuItems: MenuItem[];
  className?: string;
  iconColor?: string;
  backgroundColor?: string;
  animationDuration?: number;
  togglerSize?: number;
  itemSize?: number;
  petalGap?: number;
  triggerLabel?: string;
  menuLabel?: string;
  children: React.ReactNode;
  startAngle?: number;
  endAngle?: number;
  onOpenChange?: (isOpen: boolean) => void;
}

export default function FlowerMenu({
  menuItems,
  iconColor = "#ffffff",
  backgroundColor = "rgba(0,0,0,0.55)",
  animationDuration = 220,
  togglerSize = 44,
  itemSize: customItemSize,
  petalGap = 36,
  triggerLabel = "Open settings",
  menuLabel = "Settings",
  className,
  children,
  startAngle = 90, // default quarter circle
  endAngle = 180,
  onOpenChange,
  ...props
}: FlowerMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubMenuIndex, setActiveSubMenuIndex] = useState<number | null>(null);

  const itemCount = menuItems.length;
  // Enlarge touch target: 48px to 54px range (default 52px)
  const itemSize = customItemSize ?? 52;
  const orbitRadius = togglerSize / 2 + itemSize / 2 + petalGap;

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveSubMenuIndex(null);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((value) => {
      if (value) return false;
      setActiveSubMenuIndex(null);
      return true;
    });
  }, []);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (activeSubMenuIndex !== null) {
        setActiveSubMenuIndex(null);
      } else {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, activeSubMenuIndex]);

  const focusItem = (index: number) => {
    if (itemCount === 0) return;
    const next = (index + itemCount) % itemCount;
    itemRefs.current[next]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const activeIndex = itemRefs.current.findIndex((node) => node === document.activeElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        setIsOpen(false);
        break;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusItem(activeIndex < 0 ? 0 : activeIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusItem(activeIndex <= 0 ? itemCount - 1 : activeIndex - 1);
        break;
    }
  };

  const angleStep = itemCount > 1 ? (endAngle - startAngle) / (itemCount - 1) : 0;

  return (
    <nav
      ref={rootRef}
      aria-label={menuLabel}
      className={cn("relative shrink-0", className)}
      style={{ width: togglerSize, height: togglerSize }}
      {...props}
    >
      <button
        ref={triggerRef}
        type="button"
        className="absolute inset-0 z-20 m-auto flex touch-manipulation cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={isOpen ? "Close menu" : triggerLabel}
        onClick={toggle}
        style={{ width: togglerSize, height: togglerSize }}
      >
        {children}
      </button>

      <ul
        id={menuId}
        role="menu"
        aria-orientation="vertical"
        inert={!isOpen ? true : undefined}
        onKeyDown={onMenuKeyDown}
        className="absolute inset-0 m-0 list-none p-0 z-10"
      >
        {menuItems.map((item, index) => {
          // Calculate angle for this petal
          const angle = startAngle + angleStep * index;
          const openDelay = 10 + index * 20;
          const closeDelay = (itemCount - 1 - index) * 14;
          const isActiveSubMenu = activeSubMenuIndex === index;

          return (
            <li
              key={item.key ?? index}
              role="none"
              className={cn(
                "flower-petal absolute inset-0 m-auto transition-all duration-300",
                isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                isActiveSubMenu && "z-20",
                !isActiveSubMenu && activeSubMenuIndex !== null && "opacity-50",
              )}
              style={{
                width: itemSize,
                height: itemSize,
                transitionDelay: isOpen ? `${openDelay}ms` : `${closeDelay}ms`,
                transform: isOpen
                  ? `rotate(${angle}deg) translateX(${orbitRadius}px) rotate(-${angle}deg) scale(1)`
                  : "rotate(0deg) translateX(0) scale(0.72)",
              }}
            >
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="menuitem"
                aria-label={item.label}
                tabIndex={isOpen && !activeSubMenuIndex ? 0 : -1}
                className={cn(
                  "flex size-full touch-manipulation cursor-pointer items-center justify-center rounded-full transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:scale-95",
                  isOpen ? "pointer-events-auto" : "pointer-events-none",
                  "hover:scale-110 focus-visible:scale-110 backdrop-blur-md shadow-md border border-white/25",
                  "[&>svg]:h-5 [&>svg]:w-5",
                  isActiveSubMenu && "ring-2 ring-white/50 scale-110 bg-card/20",
                )}
                style={{
                  backgroundColor,
                  color: iconColor,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.subItems && item.subItems.length > 0) {
                    setActiveSubMenuIndex(activeSubMenuIndex === index ? null : index);
                  } else {
                    setIsOpen(false);
                    setActiveSubMenuIndex(null);
                    item.onClick?.();
                  }
                }}
                title={item.label}
                suppressHydrationWarning
              >
                <span className="sr-only" suppressHydrationWarning>
                  {item.label}
                </span>
                {item.icon}
              </button>

              {/* Sub Items radiating from this parent item */}
              {item.subItems && item.subItems.length > 0 && (
                <ul
                  className={cn(
                    "absolute inset-0 m-0 list-none p-0",
                    isActiveSubMenu ? "z-30 pointer-events-auto" : "-z-10 pointer-events-none",
                  )}
                >
                  {item.subItems.map((subItem, subIndex) => {
                    const subItemsCount = item.subItems!.length;
                    const subAngleStep = 45;
                    // Pointing towards center of screen (135 degrees relative to parent)
                    const centerSubAngle = 135;
                    const subAngle =
                      centerSubAngle + (subIndex - (subItemsCount - 1) / 2) * subAngleStep;
                    const subOpenDelay = 10 + subIndex * 20;
                    const subRadius = itemSize * 1.5; // distance from parent icon

                    return (
                      <li
                        key={`sub-${subIndex}`}
                        role="none"
                        className={cn(
                          "absolute inset-0 m-auto transition-all duration-300",
                          isActiveSubMenu
                            ? "pointer-events-auto opacity-100 z-30"
                            : "pointer-events-none opacity-0 -z-10",
                        )}
                        style={{
                          width: itemSize * 1.1,
                          height: itemSize * 1.1,
                          transitionDelay: isActiveSubMenu ? `${subOpenDelay}ms` : `0ms`,
                          transform: isActiveSubMenu
                            ? `rotate(${subAngle}deg) translateX(${subRadius}px) rotate(-${subAngle}deg) scale(1)`
                            : `rotate(${subAngle}deg) translateX(0px) rotate(-${subAngle}deg) scale(0.3)`,
                        }}
                      >
                        <button
                          role="menuitem"
                          aria-label={subItem.label}
                          tabIndex={isActiveSubMenu ? 0 : -1}
                          className={cn(
                            "flex size-full touch-manipulation cursor-pointer items-center justify-center rounded-full transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:scale-95",
                            isActiveSubMenu ? "pointer-events-auto" : "pointer-events-none",
                            "hover:scale-110 focus-visible:scale-110 backdrop-blur-md shadow-md border border-white/30 bg-card/20",
                            "[&>svg]:h-5 [&>svg]:w-5",
                          )}
                          style={{
                            backgroundColor,
                            color: iconColor,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                            setActiveSubMenuIndex(null);
                            subItem.onClick?.();
                          }}
                          title={subItem.label}
                          suppressHydrationWarning
                        >
                          <span className="sr-only" suppressHydrationWarning>
                            {subItem.label}
                          </span>
                          {subItem.icon}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
