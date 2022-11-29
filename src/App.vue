<script setup lang="ts">
import Capturer from './components/Capturer.vue'
</script>

<template>
  <div class="flex justify-center items-center w-full h-full">
    <Capturer />
  </div>
</template>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  height: 100vh;
  width: 100vw;
}
</style>
