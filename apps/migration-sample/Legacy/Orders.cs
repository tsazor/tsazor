namespace Legacy;

public record Order(int Id, string Customer, string Item, decimal Total, string Status);

public record Customer(string Name, string City);

/// <summary>
/// The app's domain service. In a Blazor Server app, components call it in-process —
/// there is no API. The migration draws that boundary: Program.cs exposes the same
/// service as /api/orders for the Tsazor pages (the Blazor pages keep calling it directly).
/// </summary>
public class OrderService
{
    private readonly List<Order> orders =
    [
        new(1, "Contoso", "Rye loaf", 4.20m, "Delivered"),
        new(2, "Fabrikam", "Croissants (12)", 18.00m, "Baking"),
        new(3, "Northwind", "Sourdough", 5.50m, "Ordered"),
    ];

    private readonly List<Customer> customers =
    [
        new("Contoso", "Seattle"),
        new("Fabrikam", "Hamburg"),
        new("Northwind", "Oslo"),
    ];

    public IReadOnlyList<Order> GetOrders() => orders;

    public Order? GetOrder(int id) => orders.FirstOrDefault(order => order.Id == id);

    public IReadOnlyList<Customer> GetCustomers() => customers;
}
