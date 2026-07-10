<!--
  ============================================================================
  components/StoryView.vue
  ----------------------------------------------------------------------------
  Thin dispatcher for the hidden Forest Trail story-mode prototype -- only
  reachable at "#/story" and "#/story/<nodeId>" (see App.vue; there is
  deliberately no nav link to either). "#/story" shows the level-select map
  (StoryMapView.vue); "#/story/<nodeId>" plays that one node
  (StoryChapterView.vue). Mirrors how PlayView.vue reads an optional puzzle
  number from its own second route segment.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { useRouter } from '../composables/useRouter.js';
import { getNodeById } from '../logic/story/story.js';
import StoryMapView from './StoryMapView.vue';
import StoryChapterView from './StoryChapterView.vue';

const { route } = useRouter();

// An unrecognized node id (typo'd/stale link) falls back to the map rather
// than a blank screen -- same spirit as App.vue's own bad-link handling.
const node = computed(() => {
  const nodeId = route.segments[1];
  return nodeId ? getNodeById(nodeId) : undefined;
});
</script>

<template>
  <StoryChapterView v-if="node" :key="node.id" :node="node" />
  <StoryMapView v-else />
</template>
