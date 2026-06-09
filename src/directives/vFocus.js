// src/directives/vFocus.js
const vFocus = {
    // The directive has a 'mounted' hook that runs when the element is mounted in the DOM
    mounted(el) {
        // The element takes focus in the DOM
        el.focus();
    },
};

export default vFocus;
