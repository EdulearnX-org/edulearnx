import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/Navbar";

const CheckoutReturn = () => {
  const [message, setMessage] = useState("Processing your payment...");
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check URL parameters for payment status
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user_id');
    const productId = urlParams.get('product_id');
    
    if (userId && productId) {
      // Process successful payment
      setMessage("Payment successful! You're being redirected...");
      
      // Simulate redirect to success page after a short delay
      setTimeout(() => {
        navigate('/payment-success');
      }, 2000);
    } else {
      // Handle case where parameters are missing
      setMessage("Verifying your payment status...");
      setError(true);
      
      // Redirect to courses after delay
      setTimeout(() => {
        navigate('/courses');
      }, 3000);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <Navbar />
      <div className="container mx-auto px-4 max-w-2xl">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {error ? "Verification Issue" : "Payment Processing"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="flex justify-center my-4">
              {!error ? (
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              ) : (
                <div className="bg-yellow-100 rounded-full p-3 w-12 h-12 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-yellow-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-gray-600">
              {message}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CheckoutReturn;
