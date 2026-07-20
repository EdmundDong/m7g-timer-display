<script lang="ts">
  import type {Snippet} from 'svelte';

  let {children}: {children: Snippet} = $props();
</script>

{@render children()}

<style>
  /* vMix's browser source shows no scrollbars, but overflow:hidden here
	   guards against any stray overflow showing as an opaque scroll area. */
  :global(html),
  :global(body) {
    overflow: hidden;
  }
</style>
