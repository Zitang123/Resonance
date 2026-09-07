'use client';

import { useEffect, useRef, type RefObject } from 'react';

type Spring = { value: number; velocity: number; target: number };
type Bounds = { top: number; left: number; width: number; height: number };
type MotionNode = {
  element: HTMLElement;
  kind: 'record' | 'capsule' | null;
  parallax: number;
  visible: boolean;
  bounds: Bounds;
  pointer: { x: number; y: number } | null;
  tiltX: Spring;
  tiltY: Spring;
  lift: Spring;
  shineX: Spring;
  shineY: Spring;
  savedStyles: Map<string, { value: string; priority: string }>;
  dispose: () => void;
};

export type RoomMotionOptions = {
  /** Change this after switching spaces or rendering a different collection. */
  revision?: string | number;
  enabled?: boolean;
  /** The complete scope is bounded, including decorative parallax elements. */
  maxElements?: number;
};

const SELECTOR =
  '[data-motion="record"], [data-motion="capsule"], [data-parallax]';
const PROPERTIES = [
  '--tilt-x',
  '--tilt-y',
  '--lift',
  '--shine-x',
  '--shine-y',
  '--shine-opacity',
  '--scroll-y',
  '--scroll-progress',
];
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const spring = (value = 0): Spring => ({ value, velocity: 0, target: value });

/** Exact critically damped spring solution; no frame-count-dependent lerping. */
function advance(axis: Spring, seconds: number, frequency = 20): boolean {
  const displacement = axis.value - axis.target;
  const impulse = axis.velocity + frequency * displacement;
  const decay = Math.exp(-frequency * seconds);
  axis.value = axis.target + (displacement + impulse * seconds) * decay;
  axis.velocity = (axis.velocity - frequency * impulse * seconds) * decay;
  if (
    Math.abs(axis.value - axis.target) < 0.008 &&
    Math.abs(axis.velocity) < 0.025
  ) {
    axis.value = axis.target;
    axis.velocity = 0;
    return false;
  }
  return true;
}

/**
 * Native-scroll, scoped motion. Put transforms on a child marked
 * data-motion-surface so pointer geometry and the surrounding text stay stable.
 * React owns content; this hook owns only the documented CSS custom properties.
 */
export function useRoomMotion<T extends HTMLElement = HTMLElement>({
  revision = '',
  enabled = true,
  maxElements = 40,
}: RoomMotionOptions = {}): RefObject<T | null> {
  const scopeRef = useRef<T>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !enabled) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const cap = clamp(
      Math.floor(Number.isFinite(maxElements) ? maxElements : 40),
      1,
      64,
    );
    const nodes = new Map<HTMLElement, MotionNode>();
    let frame = 0;
    let lastFrame = 0;
    let geometryDirty = true;
    let discoveryDirty = true;
    let disposed = false;
    let allowed = false;
    let viewportHeight = window.innerHeight;
    let scrollTop = window.scrollY;
    let scrollLeft = window.scrollX;

    const isAllowed = () =>
      !document.hidden &&
      !reduced.matches &&
      document.documentElement.dataset.effects !== 'low';
    const cancelFrame = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
    };
    const schedule = () => {
      if (!disposed && allowed && !frame) frame = requestAnimationFrame(tick);
    };
    const set = (node: MotionNode, name: string, value: string) => {
      if (node.element.style.getPropertyValue(name) !== value)
        node.element.style.setProperty(name, value);
    };
    const reset = (node: MotionNode) => {
      node.pointer = null;
      for (const axis of [node.tiltX, node.tiltY, node.lift])
        Object.assign(axis, spring());
      for (const axis of [node.shineX, node.shineY])
        Object.assign(axis, spring(50));
      set(node, '--tilt-x', '0deg');
      set(node, '--tilt-y', '0deg');
      set(node, '--lift', '0px');
      set(node, '--shine-x', '50%');
      set(node, '--shine-y', '50%');
      set(node, '--shine-opacity', '0');
      set(node, '--scroll-y', '0px');
      set(node, '--scroll-progress', '0.5');
      node.element.removeAttribute('data-room-motion-active');
    };
    const sleep = () => {
      cancelFrame();
      nodes.forEach(reset);
    };

    const intersections = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = nodes.get(entry.target as HTMLElement);
          if (!node) continue;
          node.visible = entry.isIntersecting && entry.intersectionRatio > 0;
          if (!node.visible) reset(node);
          else geometryDirty = true;
        }
        if ([...nodes.values()].some((node) => node.visible)) schedule();
        else cancelFrame();
      },
      { threshold: [0, 0.01] },
    );

    const sizes = new ResizeObserver(() => {
      geometryDirty = true;
      schedule();
    });
    sizes.observe(scope);

    function attach(element: HTMLElement): MotionNode {
      const dataKind = element.dataset.motion;
      const kind =
        dataKind === 'record' || dataKind === 'capsule' ? dataKind : null;
      const rawStrength = element.getAttribute('data-parallax');
      const parsed =
        rawStrength === null
          ? 0
          : rawStrength.trim() === ''
            ? 18
            : Number(rawStrength);
      const node: MotionNode = {
        element,
        kind,
        parallax: Number.isFinite(parsed) ? clamp(parsed, -32, 32) : 18,
        visible: false,
        bounds: { top: 0, left: 0, width: 1, height: 1 },
        pointer: null,
        tiltX: spring(),
        tiltY: spring(),
        lift: spring(),
        shineX: spring(50),
        shineY: spring(50),
        savedStyles: new Map(
          PROPERTIES.map((name) => [
            name,
            {
              value: element.style.getPropertyValue(name),
              priority: element.style.getPropertyPriority(name),
            },
          ]),
        ),
        dispose: () => {},
      };

      const pointerMove = (event: PointerEvent) => {
        if (
          !allowed ||
          !finePointer.matches ||
          !kind ||
          !node.visible ||
          event.pointerType === 'touch'
        )
          return;
        node.pointer = { x: event.clientX, y: event.clientY };
        element.setAttribute('data-room-motion-active', 'true');
        schedule();
      };
      const pointerEnter = (event: PointerEvent) => {
        geometryDirty = true;
        pointerMove(event);
      };
      const pointerLeave = () => {
        node.pointer = null;
        node.tiltX.target = node.tiltY.target = node.lift.target = 0;
        node.shineX.target = node.shineY.target = 50;
        set(node, '--shine-opacity', '0');
        schedule();
      };
      element.addEventListener('pointerenter', pointerEnter, { passive: true });
      element.addEventListener('pointermove', pointerMove, { passive: true });
      element.addEventListener('pointerleave', pointerLeave, { passive: true });
      element.addEventListener('pointercancel', pointerLeave, {
        passive: true,
      });
      node.dispose = () => {
        element.removeEventListener('pointerenter', pointerEnter);
        element.removeEventListener('pointermove', pointerMove);
        element.removeEventListener('pointerleave', pointerLeave);
        element.removeEventListener('pointercancel', pointerLeave);
        intersections.unobserve(element);
        sizes.unobserve(element);
        element.removeAttribute('data-room-motion-active');
        for (const [name, original] of node.savedStyles) {
          if (original.value)
            element.style.setProperty(name, original.value, original.priority);
          else element.style.removeProperty(name);
        }
      };
      reset(node);
      intersections.observe(element);
      sizes.observe(element);
      return node;
    }

    function discover() {
      discoveryDirty = false;
      const elements = Array.from(
        scope!.querySelectorAll<HTMLElement>(SELECTOR),
      ).slice(0, cap);
      const current = new Set(elements);
      for (const [element, node] of nodes)
        if (!current.has(element)) {
          node.dispose();
          nodes.delete(element);
        }
      for (const element of elements)
        if (!nodes.has(element)) nodes.set(element, attach(element));
      geometryDirty = true;
    }

    function tick(now: number) {
      frame = 0;
      if (disposed || !allowed) return;
      if (discoveryDirty) discover();
      const seconds = lastFrame
        ? clamp((now - lastFrame) / 1000, 0, 0.05)
        : 1 / 60;
      lastFrame = now;
      scrollTop = window.scrollY;
      scrollLeft = window.scrollX;
      // All geometry reads precede writes. Normal window scrolling reuses these
      // document-relative bounds; spring-only frames never measure the layout.
      if (geometryDirty) {
        viewportHeight = window.innerHeight;
        for (const node of nodes.values()) {
          if (!node.visible) continue;
          const box = node.element.getBoundingClientRect();
          // The integration CSS translates a parallax element itself. Remove
          // our previous translation from a refreshed measurement so repeated
          // resize/entry measurements cannot accumulate their own displacement.
          const ownTranslation = node.parallax
            ? parseFloat(node.element.style.getPropertyValue('--scroll-y')) || 0
            : 0;
          node.bounds = {
            top: box.top + scrollTop - ownTranslation,
            left: box.left + scrollLeft,
            width: Math.max(box.width, 1),
            height: Math.max(box.height, 1),
          };
        }
        geometryDirty = false;
      }

      let moving = false;
      for (const node of nodes.values()) {
        if (!node.visible) continue;
        const top = node.bounds.top - scrollTop;
        const left = node.bounds.left - scrollLeft;
        // Stop returning-card physics even before IntersectionObserver delivery.
        if (top >= viewportHeight || top + node.bounds.height <= 0) {
          reset(node);
          continue;
        }
        const progress = clamp(
          (viewportHeight - top) / (viewportHeight + node.bounds.height),
          0,
          1,
        );
        set(node, '--scroll-progress', progress.toFixed(4));
        set(
          node,
          '--scroll-y',
          `${((progress * 2 - 1) * node.parallax).toFixed(2)}px`,
        );
        // Native scrolling can move the card away from a stationary cursor
        // without an immediate pointerleave event on every browser.
        if (
          node.pointer &&
          (node.pointer.x < left ||
            node.pointer.x > left + node.bounds.width ||
            node.pointer.y < top ||
            node.pointer.y > top + node.bounds.height)
        ) {
          node.pointer = null;
          node.tiltX.target = node.tiltY.target = node.lift.target = 0;
          node.shineX.target = node.shineY.target = 50;
          set(node, '--shine-opacity', '0');
        }
        if (node.pointer && finePointer.matches) {
          const x = clamp((node.pointer.x - left) / node.bounds.width, 0, 1);
          const y = clamp((node.pointer.y - top) / node.bounds.height, 0, 1);
          const angle = node.kind === 'capsule' ? 2.3 : 2.8;
          node.tiltX.target = (0.5 - y) * 2 * angle;
          node.tiltY.target = (x - 0.5) * 2 * angle;
          node.lift.target = node.kind === 'capsule' ? -3 : -4;
          node.shineX.target = 15 + x * 70;
          node.shineY.target = 15 + y * 70;
          set(node, '--shine-opacity', '0.11');
        }
        let nodeMoving = false;
        for (const axis of [
          node.tiltX,
          node.tiltY,
          node.lift,
          node.shineX,
          node.shineY,
        ])
          nodeMoving = advance(axis, seconds) || nodeMoving;
        moving = moving || nodeMoving;
        set(node, '--tilt-x', `${node.tiltX.value.toFixed(3)}deg`);
        set(node, '--tilt-y', `${node.tiltY.value.toFixed(3)}deg`);
        set(node, '--lift', `${node.lift.value.toFixed(3)}px`);
        set(node, '--shine-x', `${node.shineX.value.toFixed(2)}%`);
        set(node, '--shine-y', `${node.shineY.value.toFixed(2)}%`);
        if (!nodeMoving && !node.pointer)
          node.element.removeAttribute('data-room-motion-active');
      }
      if (moving) schedule();
      else lastFrame = 0;
    }

    function updatePolicy() {
      allowed = isAllowed();
      if (!allowed) sleep();
      else {
        // A capability change must not leave an old hover pose behind.
        if (!finePointer.matches) nodes.forEach(reset);
        geometryDirty = true;
        schedule();
      }
    }
    const onScroll = (event: Event) => {
      // Nested scrollers move an element relative to the document; only that
      // case requires new measurements. Window scroll simply adjusts offsets.
      if (event.target !== document && event.target !== window)
        geometryDirty = true;
      schedule();
    };
    const onResize = () => {
      geometryDirty = true;
      schedule();
    };
    const policyChanges = new MutationObserver(updatePolicy);
    policyChanges.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-effects'],
    });
    const contentChanges = new MutationObserver(() => {
      discoveryDirty = true;
      schedule();
    });
    contentChanges.observe(scope, { childList: true, subtree: true });
    reduced.addEventListener('change', updatePolicy);
    finePointer.addEventListener('change', updatePolicy);
    document.addEventListener('visibilitychange', updatePolicy);
    window.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, {
      passive: true,
    });
    updatePolicy();

    return () => {
      disposed = true;
      cancelFrame();
      policyChanges.disconnect();
      contentChanges.disconnect();
      intersections.disconnect();
      sizes.disconnect();
      reduced.removeEventListener('change', updatePolicy);
      finePointer.removeEventListener('change', updatePolicy);
      document.removeEventListener('visibilitychange', updatePolicy);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      nodes.forEach((node) => node.dispose());
      nodes.clear();
    };
  }, [enabled, maxElements, revision]);

  return scopeRef;
}
