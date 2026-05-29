import { createTippy } from 'svelte-tippy';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/animations/shift-away.css';

export const tippy = createTippy({
	animation: 'shift-away',
	arrow: false,
	delay: [120, 0],
	duration: [160, 120],
	placement: 'top'
});
