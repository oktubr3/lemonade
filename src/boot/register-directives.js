// src/boot/register-directives.js
import vFocus from "src/directives/vFocus";

export default ({ app }) => {
    app.directive("focus", vFocus);
};
