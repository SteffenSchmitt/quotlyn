import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import AccountsView from '../views/AccountsView.vue'
import HistoryView from '../views/HistoryView.vue'
import TimelineView from '../views/TimelineView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/accounts', name: 'accounts', component: AccountsView },
    { path: '/history', name: 'history', component: HistoryView },
    { path: '/timeline', name: 'timeline', component: TimelineView },
  ],
})
