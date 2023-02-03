import { useElementBounding, useEventListener, useMutationObserver } from "@vueuse/core";
import { reactive, watch } from "vue";

// TODO: Remove padding from here or rename
function trackTarget(target, host, padding = 0) {
	let targetBounds = reactive(useElementBounding(target));
	let container = target.closest(".canvas-container");
	useEventListener(container, "wheel", targetBounds.update);
	// TODO: too much? find a better way to track changes
	useMutationObserver(target.parentElement, targetBounds.update, {
		attributes: true,
		childList: true,
		subtree: true,
		attributeFilter: ["style", "class"],
		characterData: true
	});
	watch(targetBounds, () => {
		host.style.width = `${targetBounds.width - padding}px`;
		host.style.height = `${targetBounds.height - padding}px`;
		host.style.top = `${targetBounds.top + padding/2}px`;
		host.style.left = `${targetBounds.left + padding/2}px`;
	});
}

export default trackTarget;