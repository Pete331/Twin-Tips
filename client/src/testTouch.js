// Reading the page's own CSS in a test, where jsdom lays nothing out.

// Whether a rule's selector picks out this element.
//
// jsdom's selector engine refuses some of what MUI writes - vendor
// pseudo-elements such as ::-moz-focus-inner - by throwing. A selector it
// cannot parse is not one these tests are asking about, so it counts as no
// match rather than failing the test.
const selects = (element, selector) => {
  if (!selector) return false;
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
};

// The styles an element takes on a touch screen.
//
// jsdom matches no media queries, so a test cannot measure a 44px target (UX
// audit finding #32). What it can do is read the rules the page was actually
// given: every rule inside a (pointer: coarse) query whose selector matches
// this element, merged in order. That is the CSS a phone applies and a laptop
// with a mouse does not - what the theme and the pages say, rendered rather
// than restated.
export const touchStyle = (element) => {
  const style = {};
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!rule.media || !/pointer:\s*coarse/.test(rule.media.mediaText)) {
        continue;
      }
      for (const inner of rule.cssRules) {
        if (!selects(element, inner.selectorText)) continue;
        for (const name of inner.style) {
          style[name] = inner.style.getPropertyValue(name);
        }
      }
    }
  }
  return style;
};

// Every value any rule outside a media query gives this property on this
// element, in document order.
//
// Not getComputedStyle, which in jsdom applies matching rules in the order they
// appear rather than by specificity - so MUI's own padding, written later,
// reads as the winner over a page's more specific rule that the browser does
// apply.
export const declaredValues = (element, property) => {
  const values = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!selects(element, rule.selectorText)) continue;
      const value = rule.style.getPropertyValue(property);
      if (value) values.push(value);
    }
  }
  return values;
};
