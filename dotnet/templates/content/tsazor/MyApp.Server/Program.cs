using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Tsazor.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
// Numbers are JSON numbers: the OpenAPI document then says "integer", not "integer or string".
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddProblemDetails();
// DataAnnotations on the endpoints' parameters: an invalid body is a 400 with a ValidationProblemDetails.
builder.Services.AddValidation();
builder.Services.AddTsazor(options =>
{
    options.ClientProject = "../MyApp.Client";
    // Development: the Vite dev server behind this app; started here unless it is already running.
    options.DevServer.Url = new Uri("http://localhost:5173");
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();

var api = app.MapGroup("/api");

string[] summaries = ["Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"];

api.MapGet("/weatherforecast", () =>
    Enumerable.Range(1, 5).Select(index => new WeatherForecast(
        DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
        Random.Shared.Next(-20, 55),
        summaries[Random.Shared.Next(summaries.Length)])))
    .WithName("GetWeatherForecast");

api.MapPost("/signups", (SignupRequest signup) =>
{
    // A rule only the server knows: the attributes have checked the rest before this runs.
    if (signup.Email.Equals("taken@example.com", StringComparison.OrdinalIgnoreCase))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["email"] = ["This email address is already signed up."],
        });
    }
    return Results.Ok(new SignupResult($"Welcome, {signup.Name}!"));
})
    .WithName("CreateSignup")
    .Produces<SignupResult>()
    .ProducesValidationProblem();

// The Tsazor app: the dev server in Development, the built files from wwwroot otherwise. After the API.
app.MapTsazor();

app.Run();

public sealed record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary);

// The attributes validate the request (AddValidation finds public types only) and go into the OpenAPI document,
// from there into the TypeScript model: the client checks the same rules before it sends.
public sealed class SignupRequest
{
    [Required, StringLength(50)]
    public required string Name { get; init; }

    [Required, EmailAddress]
    public required string Email { get; init; }

    [Range(18, 120)]
    public required int Age { get; init; }
}

public sealed record SignupResult(string Message);
