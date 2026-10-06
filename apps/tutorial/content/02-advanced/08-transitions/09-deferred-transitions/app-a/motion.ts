import { crossfade } from "@tsazor/runtime/transition";
import { quintOut } from "@tsazor/runtime/easing";

export const [send, receive] = crossfade({
    duration: 400,
    fallback: (element) => {
        const style = getComputedStyle(element);
        const transform = style.transform === "none" ? "" : style.transform;
        return {
            duration: 600,
            easing: quintOut,
            css: (t) => `transform: ${transform} scale(${t}); opacity: ${t}`,
        };
    },
});
