import '@fontsource-variable/fraunces';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './theme/tokens.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { connect } from './state/sse.js';

const app = mount(App, { target: document.getElementById('app') });
connect();

export default app;
