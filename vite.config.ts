import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const githubRepo = process.env.GITHUB_REPOSITORY
const repoName = githubRepo && githubRepo.includes('/') ? githubRepo.split('/')[1] : undefined
const defaultBase = process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/'
const base = process.env.VITE_BASE_PATH ?? defaultBase

export default defineConfig({
  plugins: [react()],
  base,
})
