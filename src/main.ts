import { createApp } from 'vue'
import { Quasar } from 'quasar'
import App from './App.vue'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'

createApp(App)
  .provide('electron', (window as any).electronAPI)
  .use(Quasar)
  .mount('#app')
