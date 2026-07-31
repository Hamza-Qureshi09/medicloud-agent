import { createBrowserRouter, Navigate } from "react-router-dom"
import { RootLayout } from "./components/layout/rootLayout"
import { RouteErrorPage } from "./pages/routeError"

export const router = createBrowserRouter([
    {
        path: "/dashboard",
        element: <RootLayout />,
        errorElement: <RouteErrorPage />,
        children: [
            {
                index: true,
                lazy: async () => ({
                    Component: (await import("@/pages/dashboard")).DashboardPage
                })
            },
            {
                path: "profiles",
                lazy: async () => ({
                    Component: (await import("@/pages/profiles/profiles")).ProfilesPage,
                }),
            },
            // Dynamic Detailed Profile Route
            {
                path: "profiles/:id",
                lazy: async () => ({
                    Component: (await import("@/pages/profiles/profileDetail")).ProfileDetailPage,
                }),
            },
            {
                path: "orders",
                lazy: async () => ({
                    Component: (await import("@/pages/orders")).OrdersPage,
                }),
            },
            {
                path: "results",
                lazy: async () => ({
                    Component: (await import("@/pages/results/index")).ResultsPage,
                }),
            },
            {
                path: "catalogs",
                lazy: async () => ({
                    Component: (await import("@/pages/catalogs")).CatalogsPage,
                }),
            },
            {
                path: "drivers",
                lazy: async () => ({
                    Component: (await import("@/pages/drivers")).DriversPage,
                }),
            },

            // if no route match show this 
            {
                path: "*",
                element: <Navigate to={"/"} replace={true} />
            }
        ]
    }
])