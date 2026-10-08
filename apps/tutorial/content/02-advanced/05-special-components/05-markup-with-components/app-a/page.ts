/**
 * A page as a content system stores it: HTML that an editor wrote, with a tag
 * where the shop's order button belongs. (Imagine it came from an API.)
 */
export const html = `<article class="post">
  <h1>Fresh from the oven</h1>
  <p>Our sourdough is back, every morning from six o'clock.</p>
  <div class="order">
    <order-button product="Sourdough"></order-button>
  </div>
</article>`;
