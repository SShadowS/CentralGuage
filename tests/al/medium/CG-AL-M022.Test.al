codeunit 80122 "CG-AL-M022 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;
    TestHttpRequestPolicy = AllowOutboundFromHandler;

    var
        Assert: Codeunit Assert;
        WeatherService: Codeunit "CG Weather Service";

    [Test]
    [HandlerFunctions('GetTemperatureHandler')]
    procedure TestGetTemperature_ReturnsValue()
    var
        Temperature: Decimal;
    begin
        // [SCENARIO] GetTemperature returns temperature from JSON response
        // [WHEN] Getting temperature for London
        Temperature := WeatherService.GetTemperature('London');

        // [THEN] Temperature is returned from mocked response
        Assert.AreEqual(15.5, Temperature, 'Temperature should be 15.5');
    end;

    [Test]
    [HandlerFunctions('GetTemperatureHandler')]
    procedure TestGetTemperature_DifferentCity()
    var
        Temperature: Decimal;
    begin
        // [SCENARIO] GetTemperature works for different cities
        // [WHEN] Getting temperature for Paris
        Temperature := WeatherService.GetTemperature('Paris');

        // [THEN] Temperature is returned
        Assert.AreEqual(15.5, Temperature, 'Temperature should be returned');
    end;

    [Test]
    [HandlerFunctions('GetTemperatureErrorHandler')]
    procedure TestGetTemperature_ReturnsZeroOnError()
    var
        Temperature: Decimal;
    begin
        // [SCENARIO] GetTemperature returns 0 when API fails
        // [WHEN] Getting temperature when API returns error
        Temperature := WeatherService.GetTemperature('InvalidCity');

        // [THEN] Returns 0
        Assert.AreEqual(0, Temperature, 'Should return 0 on error');
    end;

    [Test]
    [HandlerFunctions('PostWeatherReportSuccessHandler')]
    procedure TestPostWeatherReport_Success()
    var
        Success: Boolean;
        ReportJson: Text;
    begin
        // [SCENARIO] PostWeatherReport returns true on success
        // [GIVEN] A valid report JSON
        ReportJson := '{"date": "2025-01-15", "summary": "Sunny"}';

        // [WHEN] Posting the report
        Success := WeatherService.PostWeatherReport(ReportJson);

        // [THEN] Returns true
        Assert.IsTrue(Success, 'Should return true on 201 response');
    end;

    [Test]
    [HandlerFunctions('PostWeatherReportFailHandler')]
    procedure TestPostWeatherReport_Failure()
    var
        Success: Boolean;
        ReportJson: Text;
    begin
        // [SCENARIO] PostWeatherReport returns false on failure
        // [GIVEN] A report JSON
        ReportJson := '{"date": "2025-01-15", "summary": "Invalid"}';

        // [WHEN] Posting the report with server error
        Success := WeatherService.PostWeatherReport(ReportJson);

        // [THEN] Returns false
        Assert.IsFalse(Success, 'Should return false on 500 response');
    end;

    [Test]
    [HandlerFunctions('GetForecastHandler')]
    procedure TestGetForecast_ReturnsContent()
    var
        ForecastContent: Text;
    begin
        // [SCENARIO] GetForecast returns raw response content
        // [WHEN] Getting 5-day forecast for London
        ForecastContent := WeatherService.GetForecast('London', 5);

        // [THEN] Content is returned
        Assert.IsTrue(ForecastContent.Contains('forecast'), 'Should contain forecast data');
    end;

    [Test]
    [HandlerFunctions('GetForecastErrorHandler')]
    procedure TestGetForecast_EmptyOnError()
    var
        ForecastContent: Text;
    begin
        // [SCENARIO] GetForecast returns empty string on error
        // [WHEN] Getting forecast when API fails
        ForecastContent := WeatherService.GetForecast('InvalidCity', 5);

        // [THEN] Returns empty string
        Assert.AreEqual('', ForecastContent, 'Should return empty string on error');
    end;

    [Test]
    [HandlerFunctions('HealthCheckSuccessHandler')]
    procedure TestIsServiceAvailable_ReturnsTrue()
    var
        Available: Boolean;
    begin
        // [SCENARIO] IsServiceAvailable returns true when service is up
        // [WHEN] Checking service availability
        Available := WeatherService.IsServiceAvailable();

        // [THEN] Returns true
        Assert.IsTrue(Available, 'Should return true when service responds 200');
    end;

    [Test]
    [HandlerFunctions('HealthCheckFailHandler')]
    procedure TestIsServiceAvailable_ReturnsFalse()
    var
        Available: Boolean;
    begin
        // [SCENARIO] IsServiceAvailable returns false when service is down
        // [WHEN] Checking service availability when service is down
        Available := WeatherService.IsServiceAvailable();

        // [THEN] Returns false
        Assert.IsFalse(Available, 'Should return false when service responds 503');
    end;

    // Handler for successful temperature request
    [HttpClientHandler]
    procedure GetTemperatureHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if (Request.RequestType = HttpRequestType::Get) and
           Request.Path.Contains('temperature') then begin
            Response.Content.WriteFrom('{"city": "London", "temperature": 15.5, "unit": "C"}');
            Response.HttpStatusCode := 200;
            Response.ReasonPhrase := 'OK';
            exit(false); // Use mocked response
        end;
        exit(true); // Fall through for other requests
    end;

    // Handler for temperature request error
    [HttpClientHandler]
    procedure GetTemperatureErrorHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if Request.Path.Contains('temperature') then begin
            Response.HttpStatusCode := 404;
            Response.ReasonPhrase := 'Not Found';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for successful POST
    [HttpClientHandler]
    procedure PostWeatherReportSuccessHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if (Request.RequestType = HttpRequestType::Post) and
           Request.Path.Contains('reports') then begin
            Response.Content.WriteFrom('{"id": "12345", "status": "created"}');
            Response.HttpStatusCode := 201;
            Response.ReasonPhrase := 'Created';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for failed POST
    [HttpClientHandler]
    procedure PostWeatherReportFailHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if Request.Path.Contains('reports') then begin
            Response.Content.WriteFrom('{"error": "Internal Server Error"}');
            Response.HttpStatusCode := 500;
            Response.ReasonPhrase := 'Internal Server Error';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for forecast request
    [HttpClientHandler]
    procedure GetForecastHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    var
        City: Text;
        Days: Text;
    begin
        if Request.Path.Contains('forecast') then begin
            Request.QueryParameters.Get('city', City);
            Request.QueryParameters.Get('days', Days);
            Response.Content.WriteFrom('{"city": "' + City + '", "forecast": [{"day": 1, "temp": 15}, {"day": 2, "temp": 17}]}');
            Response.HttpStatusCode := 200;
            Response.ReasonPhrase := 'OK';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for forecast error
    [HttpClientHandler]
    procedure GetForecastErrorHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if Request.Path.Contains('forecast') then begin
            Response.HttpStatusCode := 400;
            Response.ReasonPhrase := 'Bad Request';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for health check success
    [HttpClientHandler]
    procedure HealthCheckSuccessHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if Request.Path.Contains('health') then begin
            Response.Content.WriteFrom('{"status": "healthy"}');
            Response.HttpStatusCode := 200;
            Response.ReasonPhrase := 'OK';
            exit(false);
        end;
        exit(true);
    end;

    // Handler for health check failure
    [HttpClientHandler]
    procedure HealthCheckFailHandler(Request: TestHttpRequestMessage; var Response: TestHttpResponseMessage): Boolean
    begin
        if Request.Path.Contains('health') then begin
            Response.Content.WriteFrom('{"status": "unavailable"}');
            Response.HttpStatusCode := 503;
            Response.ReasonPhrase := 'Service Unavailable';
            exit(false);
        end;
        exit(true);
    end;
}
