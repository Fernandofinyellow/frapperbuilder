<template>
	<div>
		<slot :onContextMenu="showContextMenu" />
		<ContextMenu
			v-if="contextMenuVisible"
			:pos-x="posX"
			:pos-y="posY"
			:options="contextMenuOptions"
			@select="handleContextMenuSelect"
			v-on-click-outside="() => (contextMenuVisible = false)" />
		<Dialog
			style="z-index: 40"
			:options="{
				title: 'New Component',
				size: 'sm',
				actions: [
					{
						label: 'Save',
						appearance: 'primary',
						onClick: createComponentHandler,
					},
					{ label: 'Cancel' },
				],
			}"
			v-model="showDialog">
			<template #body-content>
				<Input type="text" v-model="componentProperties.componentName" label="Component Name" required />
				<div class="mt-3">
					<Input
						class="text-sm [&>span]:!text-sm"
						type="checkbox"
						v-model="componentProperties.isGlobalComponent"
						label="Global Component" />
				</div>
			</template>
		</Dialog>
	</div>
</template>
<script setup lang="ts">
import webComponent from "@/data/webComponent";
import useStore from "@/store";
import { BuilderComponent } from "@/types/Builder/BuilderComponent";
import Block from "@/utils/block";
import blockController from "@/utils/blockController";
import getBlockTemplate from "@/utils/blockTemplate";
import { confirm, getBlockCopy } from "@/utils/helpers";
import { vOnClickOutside } from "@vueuse/components";
import { Dialog } from "frappe-ui";
import { nextTick, ref } from "vue";
import { toast } from "vue-sonner";
import ContextMenu from "./ContextMenu.vue";
const store = useStore();

const props = defineProps<{
	block: Block;
	editable: boolean;
}>();

const contextMenuVisible = ref(false);
const posX = ref(0);
const posY = ref(0);

const showDialog = ref(false);

const componentProperties = ref({
	componentName: "",
	isGlobalComponent: 0,
});

const showContextMenu = (event: MouseEvent) => {
	if (props.block.isRoot() || props.editable) return;
	contextMenuVisible.value = true;
	posX.value = event.pageX;
	posY.value = event.pageY;
	event.preventDefault();
	event.stopPropagation();
};

const handleContextMenuSelect = (action: CallableFunction) => {
	action();
	contextMenuVisible.value = false;
};

const copyStyle = () => {
	store.copiedStyle = {
		blockId: props.block.blockId,
		style: props.block.getStylesCopy(),
	};
};

const pasteStyle = () => {
	props.block.updateStyles(store.copiedStyle?.style as BlockStyleObjects);
};

const duplicateBlock = () => {
	props.block.duplicateBlock();
};

const createComponentHandler = ({ close }: { close: () => void }) => {
	const blockCopy = getBlockCopy(props.block, true);
	blockCopy.removeStyle("left");
	blockCopy.removeStyle("top");
	blockCopy.removeStyle("position");
	webComponent.insert
		.submit({
			block: blockCopy,
			component_name: componentProperties.value.componentName,
			for_web_page: componentProperties.value.isGlobalComponent ? null : store.getActivePage()?.name,
		})
		.then(async (data: BuilderComponent) => {
			await webComponent.list.promise;
			const block = store.findBlock(props.block.blockId);
			if (!block) return;
			block.extendFromComponent(data.name);
		});
	close();
};

const contextMenuOptions: ContextMenuOption[] = [
	{ label: "Copy", action: () => document.execCommand("copy") },
	{ label: "Copy Style", action: copyStyle },
	{
		label: "Paste Style",
		action: pasteStyle,
		condition: () => Boolean(store.copiedStyle && store.copiedStyle.blockId !== props.block.blockId),
	},
	{ label: "Duplicate", action: duplicateBlock },
	{
		label: "Convert To Link",
		action: () => {
			blockController.getSelectedBlocks().forEach((block: Block) => {
				if (block.isSVG()) {
					const parentBlock = block.getParentBlock();
					if (!parentBlock) return;
					const newBlockObj = getBlockTemplate("fit-container");
					const newBlock = parentBlock.addChild(newBlockObj, parentBlock.getChildIndex(block));
					newBlock.addChild(block);
					parentBlock.removeChild(block);
					newBlock.convertToLink();
					nextTick(() => {
						newBlock.selectBlock();
					});
				} else {
					block.convertToLink();
				}
			});
		},
		condition: () =>
			(props.block.isContainer() || props.block.isText()) &&
			!props.block.isExtendedFromComponent() &&
			!props.block.isRoot(),
	},
	{
		label: "Wrap In Container",
		action: () => {
			const newBlockObj = getBlockTemplate("fit-container");
			const parentBlock = props.block.getParentBlock();
			if (!parentBlock) return;

			const selectedBlocks = store.activeCanvas?.selectedBlocks || [];
			const blockPosition = Math.min(...selectedBlocks.map(parentBlock.getChildIndex.bind(parentBlock)));
			const newBlock = parentBlock?.addChild(newBlockObj, blockPosition);

			let width = null as string | null;
			// move selected blocks to newBlock
			selectedBlocks
				.sort((a, b) => parentBlock.getChildIndex(a) - parentBlock.getChildIndex(b))
				.forEach((block) => {
					parentBlock?.removeChild(block);
					newBlock?.addChild(block);
					if (!width) {
						const blockWidth = block.getStyle("width") as string | undefined;
						if (blockWidth && (blockWidth == "auto" || blockWidth.endsWith("%"))) {
							width = "100%";
						}
					}
				});

			if (width) {
				newBlock?.setStyle("width", width);
			}

			nextTick(() => {
				if (newBlock) {
					newBlock.selectBlock();
				}
			});
		},
		condition: () => {
			if (props.block.isRoot()) return false;
			if (store.activeCanvas?.selectedBlocks.length === 1) return true;
			// check if all selected blocks are siblings
			const parentBlock = props.block.getParentBlock();
			if (!parentBlock) return false;
			const selectedBlocks = store.activeCanvas?.selectedBlocks || [];
			return selectedBlocks.every((block) => block.getParentBlock() === parentBlock);
		},
	},
	{
		label: "Save As Component",
		action: () => (showDialog.value = true),
		condition: () => !props.block.isExtendedFromComponent(),
	},

	{
		label: "Repeat Block",
		action: () => {
			const repeaterBlockObj = getBlockTemplate("repeater");
			const parentBlock = props.block.getParentBlock();
			if (!parentBlock) return;
			const repeaterBlock = parentBlock.addChild(repeaterBlockObj, parentBlock.getChildIndex(props.block));
			repeaterBlock.addChild(getBlockCopy(props.block));
			parentBlock.removeChild(props.block);
			repeaterBlock.selectBlock();
			store.propertyFilter = "data key";
			toast.warning("Please set data key for repeater block");
		},
		condition: () => !props.block.isRoot() && !props.block.isRepeater(),
	},
	{
		label: "Reset Overrides",
		condition: () => props.block.hasOverrides(store.activeBreakpoint),
		action: () => {
			props.block.resetOverrides(store.activeBreakpoint);
		},
	},
	{
		label: "Reset Changes",
		action: () => {
			if (props.block.hasChildren()) {
				confirm("Reset changes in child blocks as well?").then((confirmed) => {
					props.block.resetChanges(confirmed);
				});
			} else {
				props.block.resetChanges();
			}
		},
		condition: () => props.block.isExtendedFromComponent(),
	},
	{
		label: "Sync Component",
		condition: () => Boolean(props.block.extendedFromComponent),
		action: () => {
			props.block.syncWithComponent();
		},
	},
	{
		label: "Reset Component",
		condition: () => Boolean(props.block.extendedFromComponent),
		action: () => {
			confirm("Are you sure you want to reset?").then((confirmed) => {
				if (confirmed) {
					props.block.resetWithComponent();
				}
			});
		},
	},
	{
		label: "Edit Component",
		action: () => {
			store.editComponent(props.block);
		},
		condition: () => Boolean(props.block.extendedFromComponent),
	},
	{
		label: "Delete",
		action: () => {
			props.block.getParentBlock()?.removeChild(props.block);
		},
		condition: () => {
			return (
				!props.block.isRoot() &&
				!props.block.isChildOfComponentBlock() &&
				Boolean(props.block.getParentBlock())
			);
		},
	},
];
</script>
