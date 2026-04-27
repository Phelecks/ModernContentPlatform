import { createRouter, createWebHistory } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'

const routes = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
        meta: { title: 'Modern Content Platform' }
      },
      {
        path: 'topics/:topicSlug',
        name: 'topic',
        component: () => import('@/pages/TopicPage.vue'),
        meta: { title: 'Topic' }
      },
      {
        path: 'topics/:topicSlug/:dateKey',
        name: 'topic-day',
        component: () => import('@/pages/TopicDayPage.vue'),
        meta: { title: 'Topic Day' }
      },
      {
        path: 'ops',
        name: 'operator-dashboard',
        component: () => import('@/pages/OperatorDashboardPage.vue'),
        meta: { title: 'Operator Dashboard' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} — Modern Content Platform` : 'Modern Content Platform'
})

export default router
