<script setup>
import LegalPage from "../components/LegalPage.vue";
import { t } from "../i18n.js";
</script>

<template>
  <LegalPage :doc="t.terms" />
</template>
