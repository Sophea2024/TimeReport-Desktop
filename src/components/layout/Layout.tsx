import "./Layout.css";
import Sidebar from "./Sidebar";
import Header from "./Header";

type LayoutProps = {
  children: React.ReactNode;
};

function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <Header />
        <main>{children}</main>
      </div>
    </div>
  );
}

export default Layout;
