import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import AccountPage from './pages/Account'
import AdminUsersPage from './pages/AdminUsers'
import InvitePage from './pages/Invite'
import LoginPage from './pages/Login'
import RecipeDetailPage from './pages/RecipeDetail'
import RecipeFormPage from './pages/RecipeForm'
import RecipesPage from './pages/Recipes'
import ShoppingListPage from './pages/ShoppingList'

export default function App(): React.ReactNode {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/new" element={<RecipeFormPage />} />
        <Route path="/recipes/:slug" element={<RecipeDetailPage />} />
        <Route path="/recipes/:slug/edit" element={<RecipeFormPage />} />
        <Route path="/shopping-list" element={<ShoppingListPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/recipes" replace />} />
    </Routes>
  )
}
